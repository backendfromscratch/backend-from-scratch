// Los tests del modelo falso (modelo-falso.ts): que habla como la API de verdad, comprobado con el
// propio SDK. Si el modelo falso cambiara su forma de contestar, o el SDK su forma de leer, estos
// tests fallarían antes que los de la tienda, y dirían dónde está la diferencia.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { after, beforeEach, test } from 'node:test';
import { setTimeout as dormir } from 'node:timers/promises';
import Anthropic from '@anthropic-ai/sdk';
import {
  arrancarModeloFalso,
  bloqueHerramienta,
  bloqueTexto,
  demasiadasPeticiones,
  errorEnElFlujo,
  mensaje,
  pensamiento,
  rechazo,
  sobrecargado,
  texto,
} from './modelo-falso.ts';
import { ESCENARIOS } from '../scripts/modelo-falso.ts';

const modelo = await arrancarModeloFalso();
after(() => modelo.cerrar());
beforeEach(() => modelo.reiniciar());

// Un cliente del SDK como el de la tienda, apuntando al modelo falso y sin reintentos.
const cliente = new Anthropic({ apiKey: 'clave-de-los-tests', baseURL: modelo.url, maxRetries: 0 });
const pregunta = {
  model: 'claude-haiku-5-5',
  max_tokens: 100,
  messages: [{ role: 'user' as const, content: '¿Dónde está mi pedido?' }],
};

// El contenido tal y como se compara: sin las propiedades internas que el SDK añade al leer.
const plano = (valor: unknown) => JSON.parse(JSON.stringify(valor));

// Pide el flujo con fetch, sin el SDK, y lo devuelve como una lista de eventos: su nombre (event:)
// y sus datos (data:, ya leídos).
async function flujoEnBruto() {
  const res = await fetch(`${modelo.url}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...pregunta, stream: true }),
  });
  assert.match(res.headers.get('content-type')!, /^text\/event-stream/);
  return (await res.text())
    .split('\n\n')
    .filter((bloque) => bloque !== '')
    .map((bloque) => {
      const [evento, datos] = bloque.split('\n');
      return {
        evento: evento!.replace('event: ', ''),
        datos: JSON.parse(datos!.replace('data: ', '')),
      };
    });
}

test('sin stream: messages.create recibe el mensaje en JSON, con stop_reason y usage', async () => {
  modelo.guion(texto('¡Hola!', { uso: { entrada: 25, salida: 4 } }));
  const respuesta = await cliente.messages.create(pregunta);
  // Primero, lo que ha pensado: un bloque thinking con el texto vacío y su firma, como los de
  // Claude Haiku 5.5. Después, la respuesta.
  assert.deepEqual(plano(respuesta.content), [
    { type: 'thinking', thinking: '', signature: 'firma-falsa-1' },
    { type: 'text', text: '¡Hola!' },
  ]);
  assert.equal(respuesta.stop_reason, 'end_turn');
  assert.equal(respuesta.model, 'claude-haiku-5-5');
  assert.equal(respuesta.usage.input_tokens, 25);
  assert.equal(respuesta.usage.output_tokens, 4);
});

test('el SDK lee el flujo del modelo falso: finalMessage() da el mensaje entero, texto y herramienta', async () => {
  const contenido = [
    bloqueTexto('Ahora miro tu pedido, un momento.'),
    bloqueHerramienta('ver_pedido', { id: 21 }, 'toolu_1'),
  ];
  modelo.guion(mensaje(contenido, { parada: 'tool_use', uso: { entrada: 50, salida: 20 } }));
  const flujo = cliente.messages.stream(pregunta);
  const trozosDeTexto: string[] = [];
  flujo.on('text', (trozo) => trozosDeTexto.push(trozo));
  const final = await flujo.finalMessage();
  // El SDK ha juntado los trozos: también la firma del thinking, que llega en su signature_delta.
  assert.deepEqual(plano(final.content), [pensamiento(1), ...contenido]);
  assert.equal(final.stop_reason, 'tool_use');
  assert.equal(final.usage.input_tokens, 50);
  assert.equal(final.usage.output_tokens, 20);
  // El texto llega en varios trozos (text_delta), y juntos son el texto entero.
  assert.ok(trozosDeTexto.length > 1);
  assert.equal(trozosDeTexto.join(''), 'Ahora miro tu pedido, un momento.');
  // El SDK ha pedido el flujo.
  assert.equal(modelo.peticiones[0]!.cuerpo.stream, true);
});

test('el flujo en bruto: los eventos en el orden de la API, cada uno con su event: y su data:', async () => {
  modelo.guion(mensaje([bloqueTexto('Hola'), bloqueHerramienta('buscar', { consulta: 'taza' })]));
  const eventos = await flujoEnBruto();
  // Cada data lleva su type, el mismo que el nombre del evento.
  for (const { evento, datos } of eventos) assert.equal(datos.type, evento);
  const delBloque = (index: number) =>
    eventos.filter(({ datos }) => datos.index === index).map(({ evento }) => evento);
  assert.deepEqual(
    eventos.map(({ evento }) => evento).filter((evento) => !evento.startsWith('content_block')),
    ['message_start', 'ping', 'message_delta', 'message_stop'],
  );
  // Tres bloques: el thinking, el texto y la herramienta.
  for (const index of [0, 1, 2]) {
    const delEste = delBloque(index);
    assert.equal(delEste[0], 'content_block_start');
    assert.equal(delEste.at(-1), 'content_block_stop');
    assert.ok(delEste.slice(1, -1).every((evento) => evento === 'content_block_delta'));
  }
  // El thinking, como lo manda la API con display: omitted: empieza vacío, llega un thinking_delta
  // vacío y, justo antes de cerrarse, su firma, en un signature_delta.
  assert.deepEqual(
    eventos
      .filter(({ datos }) => datos.index === 0)
      .map(({ datos }) => datos.content_block ?? datos.delta ?? null),
    [
      { type: 'thinking', thinking: '', signature: '' },
      { type: 'thinking_delta', thinking: '' },
      { type: 'signature_delta', signature: 'firma-falsa-1' },
      null,
    ],
  );
  const deltas = eventos.filter(({ evento }) => evento === 'content_block_delta');
  assert.ok(deltas.some(({ datos }) => datos.delta.type === 'text_delta'));
  assert.ok(deltas.some(({ datos }) => datos.delta.type === 'input_json_delta'));
  const final = eventos.find(({ evento }) => evento === 'message_delta')!.datos;
  assert.equal(final.delta.stop_reason, 'end_turn');
  assert.equal(final.usage.output_tokens, 30);
});

test('una negativa: stop_reason refusal y stop_details con la categoría, con y sin stream', async () => {
  modelo.guion(rechazo('cyber'), rechazo('cyber'));
  const respuesta = await cliente.messages.create(pregunta);
  assert.equal(respuesta.stop_reason, 'refusal');
  assert.equal(respuesta.stop_details?.category, 'cyber');
  const final = await cliente.messages.stream(pregunta).finalMessage();
  assert.equal(final.stop_reason, 'refusal');
  assert.equal(final.stop_details?.category, 'cyber');
});

test('429 con retry-after: el SDK lanza RateLimitError, con la cabecera', async () => {
  modelo.guion(demasiadasPeticiones(17));
  await assert.rejects(cliente.messages.create(pregunta), (error) => {
    assert.ok(error instanceof Anthropic.RateLimitError);
    assert.equal(error.headers.get('retry-after'), '17');
    assert.equal(error.type, 'rate_limit_error');
    return true;
  });
});

test('529: el SDK lanza OverloadedError, también al pedir el flujo', async () => {
  modelo.guion(sobrecargado(), sobrecargado());
  for (const llamada of [
    () => cliente.messages.create(pregunta),
    () => cliente.messages.stream(pregunta).finalMessage(),
  ]) {
    await assert.rejects(llamada(), (error) => {
      assert.ok(error instanceof Anthropic.OverloadedError);
      assert.equal(error.status, 529);
      assert.equal(error.type, 'overloaded_error');
      return true;
    });
  }
});

test('con reintentos, el SDK repite solo un 529, y a la segunda contesta: el modelo falso ve las dos', async () => {
  const conReintentos = new Anthropic({
    apiKey: 'clave-de-los-tests',
    baseURL: modelo.url,
    maxRetries: 1,
  });
  modelo.guion(sobrecargado(), texto('Ya estoy aquí'));
  const respuesta = await conReintentos.messages.create(pregunta);
  // La segunda petición: su thinking lleva la firma 2.
  assert.deepEqual(plano(respuesta.content), [
    pensamiento(2),
    { type: 'text', text: 'Ya estoy aquí' },
  ]);
  assert.equal(modelo.peticiones.length, 2);
});

test('apunta cada petición: el camino, las cabeceras (con la clave) y el cuerpo', async () => {
  modelo.guion(texto('Vale'));
  await cliente.messages.create(pregunta);
  const [peticion] = modelo.peticiones;
  assert.equal(peticion!.ruta, '/v1/messages');
  // El SDK manda la clave en Authorization: Bearer (con curl también vale la cabecera x-api-key).
  assert.equal(peticion!.cabeceras.authorization, 'Bearer clave-de-los-tests');
  assert.ok(peticion!.cabeceras['anthropic-version']);
  assert.deepEqual(peticion!.cuerpo, pregunta);
});

test('sin turnos en el guion, un 500 que lo dice', async () => {
  await assert.rejects(cliente.messages.create(pregunta), (error) => {
    assert.ok(error instanceof Anthropic.InternalServerError);
    assert.match(error.message, /no tiene más turnos/);
    return true;
  });
});

// #region flujo-lento
test('con pausa, el flujo llega poco a poco; si el cliente corta a medias, el modelo falso lo ve', async () => {
  const largo = 'Una respuesta larga, que el modelo va escribiendo poco a poco, trozo a trozo.';
  modelo.guion(texto(largo, { pausa: 20 }), texto(largo, { pausa: 20 }));
  // Entero: tarda, como mínimo, una pausa por evento (más de 10 eventos, más de 200 ms).
  const antes = performance.now();
  const final = await cliente.messages.stream(pregunta).finalMessage();
  assert.ok(performance.now() - antes >= 200);
  assert.deepEqual(plano(final.content), [pensamiento(1), { type: 'text', text: largo }]);
  assert.equal(await modelo.peticiones[0]!.acabada, 'entera');

  // Cortado: con el primer trozo de texto, el cliente cancela con un AbortController (el SDK cierra
  // la conexión). Al modelo falso no le da tiempo a mandarlo todo.
  const cancelar = new AbortController();
  const flujo = cliente.messages.stream(pregunta, { signal: cancelar.signal });
  const recibidos: string[] = [];
  flujo.on('text', (trozo) => {
    recibidos.push(trozo);
    cancelar.abort();
  });
  await assert.rejects(flujo.finalMessage(), Anthropic.APIUserAbortError);
  assert.equal(await modelo.peticiones[1]!.acabada, 'cortada');
  assert.ok(recibidos.join('').length < largo.length);
});
// #endregion flujo-lento

// #region error-en-el-flujo
test('un error en mitad del flujo: el texto del principio, y en lugar del final, un evento error', async () => {
  modelo.guion(errorEnElFlujo('Claro, te cuento lo que tenemos'));
  const eventos = await flujoEnBruto();
  const nombres = eventos.map(({ evento }) => evento);
  assert.deepEqual(nombres.slice(0, 3), ['message_start', 'ping', 'content_block_start']);
  assert.ok(nombres.includes('content_block_delta'));
  // Lo último, el error, con la forma del cuerpo de un error de la API; sin message_stop.
  assert.equal(nombres.at(-1), 'error');
  assert.ok(!nombres.includes('message_stop'));
  assert.deepEqual(eventos.at(-1)!.datos, {
    type: 'error',
    error: { type: 'overloaded_error', message: 'Overloaded' },
  });
});

test('el SDK lee el error en mitad del flujo: un APIError sin código, con el tipo; sin stream, el 529', async () => {
  modelo.guion(errorEnElFlujo('Claro, te cuento lo que tenemos'), errorEnElFlujo('Claro'));
  const flujo = cliente.messages.stream(pregunta);
  const recibidos: string[] = [];
  flujo.on('text', (trozo) => recibidos.push(trozo));
  await assert.rejects(flujo.finalMessage(), (error) => {
    assert.ok(error instanceof Anthropic.APIError);
    // La respuesta ya era un 200: el error no tiene código de estado, solo su tipo.
    assert.equal(error.status, undefined);
    assert.equal(error.type, 'overloaded_error');
    return true;
  });
  // El texto de antes del error sí llegó.
  assert.equal(recibidos.join(''), 'Claro, te cuento lo que tenemos');
  // Sin stream no hay «a medias»: la respuesta es el error, con su código.
  await assert.rejects(cliente.messages.create(pregunta), Anthropic.OverloadedError);
});

test('un corte de la conexión a medias: el SDK lanza un AnthropicError con el error de la red en cause', async () => {
  modelo.guion(errorEnElFlujo('Claro, te cuento', 'corte'), errorEnElFlujo('Claro', 'corte'));
  const flujo = cliente.messages.stream(pregunta);
  const recibidos: string[] = [];
  flujo.on('text', (trozo) => recibidos.push(trozo));
  await assert.rejects(flujo.finalMessage(), (error) => {
    // No es un APIError (la respuesta ya era un 200, y no hay evento error): es el corte.
    assert.ok(error instanceof Anthropic.AnthropicError);
    assert.ok(!(error instanceof Anthropic.APIError));
    assert.ok(error.cause instanceof Error);
    return true;
  });
  assert.equal(recibidos.join(''), 'Claro, te cuento');
  // Sin stream, la conexión se cierra antes de contestar: para el SDK, un APIConnectionError.
  await assert.rejects(cliente.messages.create(pregunta), Anthropic.APIConnectionError);
});
// #endregion error-en-el-flujo

test('con pausa, el flujo llega poco a poco, y sin stream la respuesta entera tarda lo mismo', async () => {
  const largo = 'Una respuesta larga, que el modelo va escribiendo poco a poco, trozo a trozo.';
  modelo.guion(texto(largo, { pausa: 20 }), texto(largo, { pausa: 20 }));
  // En streaming, una pausa entre evento y evento (unos 20 eventos): el primer trozo de texto llega
  // pronto, y el resto, poco a poco.
  const antes = performance.now();
  let primero = 0;
  const flujo = cliente.messages.stream(pregunta);
  flujo.once('text', () => (primero = performance.now() - antes));
  await flujo.finalMessage();
  const total = performance.now() - antes;
  assert.ok(total >= 200 && primero < total - 100, `primero ${primero} ms, total ${total} ms`);
  // Sin stream, lo mismo que tardaría el flujo, y la respuesta llega entera, de una vez.
  const antesJson = performance.now();
  const respuesta = await cliente.messages.create(pregunta);
  assert.ok(performance.now() - antesJson >= 200);
  assert.deepEqual(plano(respuesta.content), [pensamiento(2), { type: 'text', text: largo }]);
});

// #region practicar
// npm run modelo-falso (scripts/modelo-falso.ts): el mismo modelo falso, en su propio proceso, para
// practicar. Arranca en un puerto libre (PORT=0) con el escenario 429, y contesta con él a todas
// las peticiones, una línea por cada una; con un escenario que no existe, dice cuáles hay.
test('npm run modelo-falso arranca con el escenario que se le pide y contesta siempre con él', async () => {
  const proceso = spawn(process.execPath, ['scripts/modelo-falso.ts', '429'], {
    env: { ...process.env, PORT: '0' },
  });
  let salida = '';
  proceso.stdout.setEncoding('utf8').on('data', (trozo: string) => (salida += trozo));
  try {
    let url: string | undefined;
    for (let ms = 0; url === undefined && ms < 5000; ms += 20) {
      url = /Modelo falso en (http:\/\/\S+), con el escenario 429/.exec(salida)?.[1];
      if (url === undefined) await dormir(20);
    }
    assert.ok(url, `no ha dicho dónde escucha: ${salida}`);
    const practica = new Anthropic({ apiKey: 'una-cualquiera', baseURL: url, maxRetries: 0 });
    for (let vez = 0; vez < 2; vez++) {
      await assert.rejects(practica.messages.create(pregunta), (error) => {
        assert.ok(error instanceof Anthropic.RateLimitError);
        assert.equal(error.headers.get('retry-after'), '3');
        return true;
      });
    }
    assert.equal(salida.match(/← 429 rate_limit_error, retry-after: 3/g)?.length, 2);
  } finally {
    proceso.kill('SIGTERM');
  }
  // Con SIGTERM (Ctrl + C, o docker compose stop), cierra el servidor y termina bien.
  assert.deepEqual(await once(proceso, 'exit'), [0, null]);

  const otro = spawn(process.execPath, ['scripts/modelo-falso.ts', 'ninguno']);
  let errores = '';
  otro.stderr.setEncoding('utf8').on('data', (trozo: string) => (errores += trozo));
  assert.deepEqual(await once(otro, 'exit'), [1, null]);
  assert.match(
    errores,
    /No hay escenario «ninguno»\. Elige uno: normal, 429, 529, lento, herramienta/,
  );

  // Desde la lección 3, el escenario herramienta: primero pide buscar_productos; con su resultado
  // al final de la conversación (un tool_result), contesta con lo que le ha llegado.
  const pide = [{ role: 'user', content: '¿Tenéis tazas?' }];
  const primera = ESCENARIOS.get('herramienta')!({ messages: pide });
  assert.ok(primera.tipo === 'mensaje');
  assert.equal(primera.parada, 'tool_use');
  assert.deepEqual(
    primera.contenido.at(-1),
    bloqueHerramienta('buscar_productos', { consulta: 'taza' }),
  );
  const resultado = {
    type: 'tool_result',
    tool_use_id: 'toolu_falso_buscar_productos',
    content: '[{"id":3,"nombre":"Taza","precioCentimos":850}]',
  };
  const segunda = ESCENARIOS.get('herramienta')!({
    messages: [
      ...pide,
      { role: 'assistant', content: primera.contenido },
      { role: 'user', content: [resultado] },
    ],
  });
  assert.ok(segunda.tipo === 'mensaje');
  assert.equal(segunda.parada, 'end_turn');
  const [bloque] = segunda.contenido;
  assert.ok(bloque?.type === 'text');
  assert.match(bloque.text, /me ha devuelto: \[\{"id":3,"nombre":"Taza"/);
});
// #endregion practicar
