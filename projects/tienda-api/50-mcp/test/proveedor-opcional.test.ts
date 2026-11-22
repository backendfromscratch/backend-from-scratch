// El proveedor de identidad es opcional (Fase 8): en un servidor donde no hay ninguno al alcance, la
// tienda arranca sin él y las dos rutas del proveedor dicen que no lo hay. Cada caso arranca la
// tienda en otro proceso, con las OIDC_* que toquen: la configuración se lee al importarla.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { arrancarProveedor, MARTA } from '../scripts/proveedor.ts';
import { usarBd } from './bd.ts';

usarBd();

const ejecutar = promisify(execFile);

const OIDC = ['OIDC_EMISOR', 'OIDC_CLIENTE_ID', 'OIDC_CLIENTE_SECRETO', 'OIDC_VUELTA'] as const;

// El entorno de los tests, con solo las OIDC_* que se pidan.
const entorno = (conservar: readonly string[] = []) => {
  const env = { ...process.env };
  for (const nombre of OIDC) if (!conservar.includes(nombre)) delete env[nombre];
  return env;
};

// Importa la app en otro proceso, hace las peticiones y escribe sus respuestas como JSON.
const desdeOtroProceso = async (peticiones: [string, RequestInit?][], env = entorno()) => {
  const programa = `
    const { app } = await import('./src/app.ts');
    const { pool } = await import('./src/bd.ts');
    const respuestas = [];
    for (const [ruta, opciones] of ${JSON.stringify(peticiones)}) {
      const res = await app.request(ruta, opciones);
      respuestas.push({
        status: res.status,
        tipo: res.headers.get('content-type'),
        cuerpo: res.headers.get('content-type')?.includes('json') ? await res.json() : null,
      });
    }
    await pool.end();
    console.log(JSON.stringify(respuestas));
  `;
  const { stdout } = await ejecutar('node', ['--input-type=module', '-e', programa], { env });
  return JSON.parse(stdout) as {
    status: number;
    tipo: string;
    cuerpo: Record<string, unknown> | null;
  }[];
};

const NO_HAY = {
  type: 'https://tienda.example/problemas/proveedor-no-configurado',
  title: 'La tienda no tiene proveedor de identidad',
  status: 404,
};

test('sin ninguna OIDC_*, el servidor arranca y GET /v2/sesion/proveedor responde 404 con problema proveedor-no-configurado', async () => {
  const [res] = await desdeOtroProceso([['/v2/sesion/proveedor']]);
  assert.equal(res!.status, 404);
  assert.match(res!.tipo, /^application\/problem\+json/);
  assert.partialDeepStrictEqual(res!.cuerpo, NO_HAY);
});

test('la vuelta del proveedor también responde 404 sin configuración', async () => {
  const [res] = await desdeOtroProceso([['/v2/sesion/proveedor/vuelta?code=x&state=y']]);
  assert.equal(res!.status, 404);
  assert.partialDeepStrictEqual(res!.cuerpo, NO_HAY);
});

test('con solo algunas OIDC_*, el servidor no arranca y el mensaje dice cuáles faltan', async () => {
  await assert.rejects(
    desdeOtroProceso([['/v2/sesion/proveedor']], entorno(['OIDC_EMISOR', 'OIDC_CLIENTE_ID'])),
    (error: { code: number; stderr: string }) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /OIDC_CLIENTE_SECRETO/);
      assert.match(error.stderr, /OIDC_VUELTA/);
      assert.doesNotMatch(error.stderr, /Configuración: OIDC_EMISOR/);
      return true;
    },
  );
});

test('con las cuatro, el inicio con proveedor funciona como en el paso 34', async () => {
  const proveedor = await arrancarProveedor(0, '127.0.0.1', { ...MARTA });
  try {
    const emisor = `http://127.0.0.1:${proveedor.address().port}`;
    proveedor.issuer.url = emisor;
    const [res] = await desdeOtroProceso([['/v2/sesion/proveedor', { redirect: 'manual' }]], {
      ...entorno(OIDC),
      OIDC_EMISOR: emisor,
    });
    assert.equal(res!.status, 302);
  } finally {
    await proveedor.stop();
  }
});

test('el email y la contraseña funcionan sin proveedor', async () => {
  const [res] = await desdeOtroProceso([
    [
      '/v2/sesion',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ana@tienda.example', contrasena: 'ana-practica-2026' }),
      },
    ],
  ]);
  assert.equal(res!.status, 200);
  assert.equal(res!.cuerpo!.email, 'ana@tienda.example');
});
