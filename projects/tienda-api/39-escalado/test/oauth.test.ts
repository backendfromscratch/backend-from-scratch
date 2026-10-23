import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { pool } from '../src/bd.ts';
import { arrancarProveedor, MARTA } from '../scripts/proveedor.ts';
import { usarBd } from './bd.ts';

usarBd();

// El proveedor de práctica, aquí mismo, en un puerto libre de 127.0.0.1: nada sale del ordenador.
// persona es quien «inicia sesión» en él; cada test la cambia si necesita otra.
const persona: Record<string, unknown> = { ...MARTA };
const proveedor = await arrancarProveedor(0, '127.0.0.1', persona);
proveedor.issuer.url = `http://127.0.0.1:${proveedor.address().port}`;
after(() => proveedor.stop());

// La tienda lee OIDC_EMISOR al arrancar: primero se cambia, después se importa la app.
process.env.OIDC_EMISOR = proveedor.issuer.url;
const { app } = await import('../src/app.ts');

/** La primera cookie de una cabecera Set-Cookie, como «nombre=valor». */
const cookieDe = (res: Response, nombre: string) =>
  new RegExp(`(?:^|, )(${nombre}=[^;]*)`).exec(res.headers.get('set-cookie') ?? '')?.[1];

/**
 * El flujo entero, siguiendo cada redirección a mano, como haría el navegador: la tienda manda al
 * proveedor, el proveedor devuelve a la tienda con un código, y la tienda inicia la sesión.
 */
async function iniciarConProveedor() {
  const ida = await app.request('/v2/sesion/proveedor');
  const alProveedor = new URL(ida.headers.get('location')!);
  const inicio = cookieDe(ida, 'proveedor')!;
  const delProveedor = await fetch(alProveedor, { redirect: 'manual' });
  const deVuelta = new URL(delProveedor.headers.get('location')!);
  const rutaDeVuelta = deVuelta.pathname + deVuelta.search;
  const vuelta = await app.request(rutaDeVuelta, { headers: { Cookie: inicio } });
  return { ida, alProveedor, inicio, rutaDeVuelta, vuelta };
}

const yo = async (vuelta: Response) =>
  (await app.request('/v2/yo', { headers: { Cookie: cookieDe(vuelta, 'sesion')! } })).json();

test('la ida: al proveedor, con el código de autorización, PKCE S256, state y nonce', async () => {
  const ida = await app.request('/v2/sesion/proveedor');
  assert.equal(ida.status, 302);
  const url = new URL(ida.headers.get('location')!);
  assert.equal(url.origin + url.pathname, `${proveedor.issuer.url}/authorize`);
  const parametros = Object.fromEntries(url.searchParams);
  assert.equal(parametros.response_type, 'code');
  assert.equal(parametros.client_id, 'tienda');
  assert.equal(parametros.redirect_uri, 'http://localhost:3000/v2/sesion/proveedor/vuelta');
  assert.equal(parametros.scope, 'openid email profile');
  assert.equal(parametros.code_challenge_method, 'S256');
  assert.match(parametros.code_challenge!, /^[\w-]{43}$/);
  assert.ok(parametros.state && parametros.nonce);
  const cookie = ida.headers.get('set-cookie')!;
  assert.match(
    cookie,
    /^proveedor=[\w-]+; Max-Age=600; Path=\/v2\/sesion\/proveedor; HttpOnly; Secure; SameSite=Lax$/,
  );
  // El verificador de PKCE va en la cookie, nunca en la URL.
  assert.ok(
    !url.href.includes(
      JSON.parse(Buffer.from(cookie.split(/[=;]/)[1]!, 'base64url').toString()).verificador,
    ),
  );
});

test('el flujo entero: Marta vuelve con un código, se crea su cuenta sin contraseña y tiene sesión', async () => {
  const { vuelta } = await iniciarConProveedor();
  assert.equal(vuelta.status, 303);
  assert.equal(vuelta.headers.get('location'), '/v2/yo');
  assert.match(vuelta.headers.get('set-cookie')!, /proveedor=; Max-Age=0/);
  const cuenta = await yo(vuelta);
  assert.equal(cuenta.tipo, 'usuario');
  assert.equal(cuenta.email, 'marta@ejemplo.com');
  const { rows } = await pool.query(
    'SELECT hash_contrasena, sub_proveedor FROM usuarios WHERE id = $1',
    [cuenta.id],
  );
  assert.deepEqual(rows[0], { hash_contrasena: null, sub_proveedor: 'proveedor-marta-0001' });

  // La segunda vez, la misma cuenta: se la reconoce por el sub.
  const otraVez = await iniciarConProveedor();
  assert.equal((await yo(otraVez.vuelta)).id, cuenta.id);
});

test('un email verificado que ya tiene cuenta: se une a ella; sin verificar, 409 y no se une', async () => {
  Object.assign(persona, {
    sub: 'proveedor-carmen',
    email: 'Carmen@ejemplo.com',
    email_verified: false,
  });
  const sinVerificar = await iniciarConProveedor();
  assert.equal(sinVerificar.vuelta.status, 409);
  assert.equal(
    (await sinVerificar.vuelta.json()).type,
    'https://tienda.example/problemas/email-sin-verificar',
  );
  assert.equal(cookieDe(sinVerificar.vuelta, 'sesion'), undefined);

  persona.email_verified = true;
  const verificado = await iniciarConProveedor();
  assert.equal(verificado.vuelta.status, 303);
  assert.deepEqual(await yo(verificado.vuelta), {
    tipo: 'usuario',
    id: 3,
    email: 'carmen@ejemplo.com',
    rol: 'cliente',
  });
  const { rows } = await pool.query('SELECT sub_proveedor FROM usuarios WHERE id = 3');
  assert.equal(rows[0].sub_proveedor, 'proveedor-carmen');
  Object.assign(persona, MARTA);
});

test('un state cambiado: 400, y ni sesión ni cuenta', async () => {
  const ida = await app.request('/v2/sesion/proveedor');
  const delProveedor = await fetch(ida.headers.get('location')!, { redirect: 'manual' });
  const deVuelta = new URL(delProveedor.headers.get('location')!);
  deVuelta.searchParams.set('state', 'un-state-de-otro-navegador');
  const vuelta = await app.request(deVuelta.pathname + deVuelta.search, {
    headers: { Cookie: cookieDe(ida, 'proveedor')! },
  });
  assert.equal(vuelta.status, 400);
  assert.equal((await vuelta.json()).type, 'https://tienda.example/problemas/inicio-con-proveedor');
  assert.equal(cookieDe(vuelta, 'sesion'), undefined);
});

test('el mismo código otra vez, aunque se repita la cookie: el proveedor ya lo gastó, 400', async () => {
  const { inicio, rutaDeVuelta, vuelta } = await iniciarConProveedor();
  assert.equal(vuelta.status, 303);
  const repetida = await app.request(rutaDeVuelta, { headers: { Cookie: inicio } });
  assert.equal(repetida.status, 400);
  assert.equal(cookieDe(repetida, 'sesion'), undefined);
});

test('la vuelta sin la cookie de la ida (otro navegador): 400', async () => {
  const ida = await app.request('/v2/sesion/proveedor');
  const delProveedor = await fetch(ida.headers.get('location')!, { redirect: 'manual' });
  const deVuelta = new URL(delProveedor.headers.get('location')!);
  const vuelta = await app.request(deVuelta.pathname + deVuelta.search);
  assert.equal(vuelta.status, 400);
});
