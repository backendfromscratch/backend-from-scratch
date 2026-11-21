// El asistente es opcional (Fase 11): sin ANTHROPIC_API_KEY, la tienda arranca y funciona, y solo
// POST /v2/asistente dice que no lo hay. Cada caso arranca la tienda en otro proceso, con el entorno
// que toque: la configuración se lee al importarla (como en proveedor-opcional.test.ts). Y lo mismo
// para probar los tiempos con otra configuración que la de test/.env.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { ESPERA_POR_DEFECTO } from '../src/asistente/errores.ts';
import { usarBd } from './bd.ts';
import { ANA, CARMEN } from './identidades.ts';
import { arrancarModeloFalso, demasiadasPeticiones, texto } from './modelo-falso.ts';

usarBd();

const ejecutar = promisify(execFile);

// Importa la tienda en otro proceso, inicia una sesión de Carmen (o de quien se diga), hace las
// peticiones con ella y escribe sus respuestas como JSON.
const desdeOtroProceso = async (
  peticiones: [string, RequestInit?][],
  env: NodeJS.ProcessEnv,
  usuario = CARMEN,
) => {
  const programa = `
    const { app } = await import('./src/app.ts');
    const { pool } = await import('./src/bd.ts');
    const { crearSesion } = await import('./src/sesiones.ts');
    const sesion = { Cookie: 'sesion=' + (await crearSesion(${usuario})), Origin: 'http://localhost:3000' };
    const respuestas = [];
    for (const [ruta, opciones = {}] of ${JSON.stringify(peticiones)}) {
      const res = await app.request(ruta, { ...opciones, headers: { ...opciones.headers, ...sesion } });
      respuestas.push({
        status: res.status,
        retryAfter: res.headers.get('retry-after'),
        cuerpo: res.headers.get('content-type')?.includes('json') ? await res.json() : null,
      });
    }
    await pool.end();
    console.log(JSON.stringify(respuestas));
  `;
  const { stdout } = await ejecutar('node', ['--input-type=module', '-e', programa], { env });
  return JSON.parse(stdout) as {
    status: number;
    retryAfter: string | null;
    cuerpo: Record<string, unknown> | null;
  }[];
};

const pregunta: [string, RequestInit] = [
  '/v2/asistente',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mensajes: [{ rol: 'usuario', texto: 'Hola' }] }),
  },
];

const sinClave = () => {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  return env;
};

const NO_HAY = {
  type: 'https://tienda.example/problemas/asistente-no-configurado',
  title: 'La tienda no tiene asistente',
  status: 503,
};

// La misma pregunta, pidiendo la respuesta en streaming (lección 2).
const preguntaEnFlujo: [string, RequestInit] = [
  pregunta[0],
  {
    ...pregunta[1],
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
  },
];

test('sin ANTHROPIC_API_KEY, el asistente responde 503 asistente-no-configurado, y el resto de la tienda funciona', async () => {
  const [asistente, enFlujo, productos, pedidos] = await desdeOtroProceso(
    [pregunta, preguntaEnFlujo, ['/v2/productos'], ['/v2/pedidos']],
    sinClave(),
  );
  assert.equal(asistente!.status, 503);
  assert.partialDeepStrictEqual(asistente!.cuerpo, NO_HAY);
  // Esperar no lo arregla: sin Retry-After.
  assert.equal(asistente!.retryAfter, null);
  // En streaming, igual: el mismo 503, en JSON, antes de empezar ningún flujo.
  assert.equal(enFlujo!.status, 503);
  assert.partialDeepStrictEqual(enFlujo!.cuerpo, NO_HAY);
  assert.equal(productos!.status, 200);
  assert.equal(pedidos!.status, 200);
});

test('sin ANTHROPIC_API_KEY, encargar una descripción (lección 7) también responde 503 asistente-no-configurado', async () => {
  const [encargo] = await desdeOtroProceso(
    [['/v2/productos/3/descripcion', { method: 'POST' }]],
    sinClave(),
    ANA,
  );
  assert.equal(encargo!.status, 503);
  assert.partialDeepStrictEqual(encargo!.cuerpo, NO_HAY);
});

test('ANTHROPIC_API_KEY vacía (como en .env.ejemplo) es lo mismo que no tenerla', async () => {
  const [asistente] = await desdeOtroProceso([pregunta], { ...process.env, ANTHROPIC_API_KEY: '' });
  assert.equal(asistente!.status, 503);
  assert.partialDeepStrictEqual(asistente!.cuerpo, NO_HAY);
});

test('con la clave y nadie contestando en ANTHROPIC_BASE_URL (un corte de red): 503 con Retry-After', async () => {
  // test/.env apunta ANTHROPIC_BASE_URL a un puerto donde no escucha nadie.
  const [asistente] = await desdeOtroProceso([pregunta], {
    ...process.env,
    ANTHROPIC_BASE_URL: 'http://127.0.0.1:9',
    LOG_LEVEL: 'silent',
  });
  assert.equal(asistente!.status, 503);
  assert.equal(asistente!.cuerpo!.type, 'https://tienda.example/problemas/asistente-no-disponible');
  assert.equal(asistente!.retryAfter, String(ESPERA_POR_DEFECTO));
});

test('con reintentos, el SDK esperaría el retry-after de un 429 (30 s): el tiempo máximo del asistente lo corta', async () => {
  const modelo = await arrancarModeloFalso();
  try {
    modelo.guion(demasiadasPeticiones(30), texto('Hola'));
    const antes = Date.now();
    const [asistente] = await desdeOtroProceso([pregunta], {
      ...process.env,
      ANTHROPIC_BASE_URL: modelo.url,
      MODELO_REINTENTOS: '2',
      ASISTENTE_TIEMPO_MAXIMO_MS: '1000',
      LOG_LEVEL: 'silent',
    });
    const segundos = (Date.now() - antes) / 1000;
    assert.equal(asistente!.status, 503);
    assert.equal(
      asistente!.cuerpo!.type,
      'https://tienda.example/problemas/asistente-no-disponible',
    );
    assert.match(String(asistente!.cuerpo!.detail), /no contesta/);
    // El SDK iba a repetir la petición a los 30 segundos; al segundo, la tienda ha dejado de
    // esperar (el resto es arrancar el otro proceso).
    assert.equal(modelo.peticiones.length, 1);
    assert.ok(segundos < 15, `${segundos} segundos`);
  } finally {
    await modelo.cerrar();
  }
});
