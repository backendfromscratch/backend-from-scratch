import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { pool } from '../src/bd.ts';
import { usarBd } from './bd.ts';

usarBd();

/** POST /v2/sesion con un email y una contraseña, y las cabeceras que se le den. */
const iniciar = (email: string, contrasena: string, cabeceras: Record<string, string> = {}) =>
  app.request('/v2/sesion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...cabeceras },
    body: JSON.stringify({ email, contrasena }),
  });

/** El id de sesión de la cabecera Set-Cookie de una respuesta. */
function idDe(res: Response): string {
  const id = /^sesion=([^;]*)/.exec(res.headers.get('set-cookie') ?? '')?.[1];
  assert.ok(id, 'la respuesta trae la cookie sesion');
  return id;
}

const yo = (cabeceras: Record<string, string> = {}) =>
  app.request('/v2/yo', { headers: cabeceras });

const conCookie = (id: string) => ({ Cookie: `sesion=${id}` });

test('iniciar sesión (con el email en otras mayúsculas): 200 con la cuenta; /v2/yo la reconoce', async () => {
  const res = await iniciar('ANA@tienda.example', 'ana-practica-2026');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { id: 1, email: 'ana@tienda.example', rol: 'admin' });
  const id = idDe(res);
  const conLaCookie = await yo(conCookie(id));
  assert.equal(conLaCookie.status, 200);
  assert.deepEqual(await conLaCookie.json(), {
    tipo: 'usuario',
    id: 1,
    email: 'ana@tienda.example',
    rol: 'admin',
  });
  // La misma sesión, como Bearer: lo que haría un programa que no guarda cookies.
  const conBearer = await yo({ Authorization: `Bearer ${id}` });
  assert.deepEqual(await conBearer.json(), {
    tipo: 'usuario',
    id: 1,
    email: 'ana@tienda.example',
    rol: 'admin',
  });
});

test('la cookie: un id largo al azar, HttpOnly, Secure, SameSite=Lax, Path=/ y una semana', async () => {
  const res = await iniciar('luis@tienda.example', 'luis-practica-2026');
  const cookie = res.headers.get('set-cookie')!;
  assert.match(idDe(res), /^[A-Za-z0-9_-]{43}$/); // 32 bytes en base64url
  const atributos = cookie.split('; ').slice(1);
  for (const atributo of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=604800']) {
    assert.ok(atributos.includes(atributo), `${atributo} en ${cookie}`);
  }
});

test('en la tabla, solo el SHA-256 del id, y caduca dentro de una semana', async () => {
  const id = idDe(await iniciar('carmen@ejemplo.com', 'carmen-practica-2026'));
  const hash = createHash('sha256').update(id).digest();
  const { rows } = await pool.query(
    `SELECT usuario_id, expira_en - creada_en AS dura FROM sesiones WHERE id_hash = $1`,
    [hash],
  );
  assert.equal(rows[0].usuario_id, 3);
  assert.equal(rows[0].dura.days, 7);
  const { rows: conElId } = await pool.query(
    `SELECT count(*)::int AS n FROM sesiones WHERE encode(id_hash, 'escape') LIKE $1`,
    [`%${id}%`],
  );
  assert.equal(conElId[0].n, 0, 'el id no está en la tabla');
});

test('una contraseña mala y un email que no existe: la misma respuesta, sin cookie', async () => {
  const mala = await iniciar('ana@tienda.example', 'no-es-la-contrasena');
  const nadie = await iniciar('nadie@ejemplo.com', 'no-es-la-contrasena');
  assert.equal(mala.status, 400);
  assert.equal(nadie.status, 400);
  const cuerpo = await mala.json();
  assert.deepEqual(await nadie.json(), cuerpo);
  assert.equal(cuerpo.type, 'https://tienda.example/problemas/credenciales-no-validas');
  assert.equal(mala.headers.get('set-cookie'), null);
  assert.equal(nadie.headers.get('set-cookie'), null);
});

test('una cuenta sin contraseña (de un proveedor de identidad) no puede entrar con una', async () => {
  await pool.query(`INSERT INTO usuarios (email) VALUES ('sin-contrasena@ejemplo.com')`);
  const res = await iniciar('sin-contrasena@ejemplo.com', 'cualquier cosa');
  assert.equal(res.status, 400);
});

test('/v2/yo sin sesión, o con un id inventado: 401 con WWW-Authenticate', async () => {
  const casos: Record<string, string>[] = [
    {},
    conCookie('inventado'),
    { Authorization: 'Bearer inventado' },
  ];
  for (const cabeceras of casos) {
    const res = await yo(cabeceras);
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('www-authenticate'), 'Bearer realm="tienda-api"');
    assert.equal(res.headers.get('content-type'), 'application/problem+json');
  }
});

test('cerrar sesión: 204, la cookie se borra, y el id viejo ya no vale aunque se guarde', async () => {
  const id = idDe(await iniciar('pablo@ejemplo.com', 'pablo-practica-2026'));
  // Origin, como lo manda el navegador: sin él, una petición con la cookie no pasa (lección 7).
  const res = await app.request('/v2/sesion', {
    method: 'DELETE',
    headers: { ...conCookie(id), Origin: 'http://localhost:3000' },
  });
  assert.equal(res.status, 204);
  assert.match(res.headers.get('set-cookie')!, /^sesion=; Max-Age=0; Path=\/; HttpOnly; Secure/);
  assert.equal((await yo(conCookie(id))).status, 401);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM sesiones WHERE usuario_id = 4');
  assert.equal(rows[0].n, 0);
});

test('una sesión caducada no vale, y se borra', async () => {
  const id = idDe(await iniciar('ana@tienda.example', 'ana-practica-2026'));
  const hash = createHash('sha256').update(id).digest();
  await pool.query(
    `UPDATE sesiones SET expira_en = now() - interval '1 second' WHERE id_hash = $1`,
    [hash],
  );
  assert.equal((await yo(conCookie(id))).status, 401);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM sesiones WHERE id_hash = $1', [
    hash,
  ]);
  assert.equal(rows[0].n, 0);
});

test('al iniciar sesión, un id nuevo: el que traía el navegador se borra (fijación de sesión)', async () => {
  const antes = idDe(await iniciar('luis@tienda.example', 'luis-practica-2026'));
  const res = await iniciar('luis@tienda.example', 'luis-practica-2026', conCookie(antes));
  const despues = idDe(res);
  assert.notEqual(despues, antes);
  assert.equal((await yo(conCookie(antes))).status, 401);
  assert.equal((await yo(conCookie(despues))).status, 200);
});
