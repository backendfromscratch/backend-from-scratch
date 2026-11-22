// El correo de confirmación (Fase 9, lección 1), sin servidor de correo: con Nodemailer, un
// transporte JSON (jsonTransport) no manda nada, solo devuelve el mensaje que habría mandado.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { type AddressInfo, createServer, type Socket } from 'node:net';
import { mock, test } from 'node:test';
import { createTransport } from 'nodemailer';
import { crearTransporte, enviarConfirmacion } from '../src/correo.ts';
import { buscarPedido } from '../src/datos.ts';
import { log } from '../src/log.ts';
import { usarBd } from './bd.ts';

usarBd();

/** Un transporte que no manda nada, y los mensajes que habría mandado. */
function transporteDePrueba() {
  const transporte = createTransport({ jsonTransport: true });
  const enviar = mock.method(transporte, 'sendMail');
  return {
    transporte,
    async mensajes() {
      // Lo que devuelve sendMail con jsonTransport: el mensaje, en JSON, en message.
      const resultados = (await Promise.all(
        enviar.mock.calls.map((llamada) => llamada.result),
      )) as unknown as { message: string }[];
      return resultados.map((info) => JSON.parse(info.message));
    },
  };
}

test('sin SMTP_URL, no manda nada y lo dice en el log', async (t) => {
  const info = t.mock.method(log, 'info');
  // El 21 es de Carmen: tiene a quién escribir, pero no con qué (test/.env no pone SMTP_URL).
  const pedido = (await buscarPedido(21))!;
  assert.equal(await enviarConfirmacion(pedido), 'sin-smtp');
  const [datos, mensaje] = info.mock.calls.at(-1)!.arguments as unknown as [object, string];
  assert.deepEqual(datos, { pedidoId: 21 });
  assert.match(mensaje, /sin SMTP_URL/);
});

test('un pedido sin cliente no tiene correo', async () => {
  // Los pedidos de antes de las cuentas (Fase 6) no son de nadie.
  const { transporte, mensajes } = transporteDePrueba();
  const pedido = { ...(await buscarPedido(21))!, clienteId: null };
  assert.equal(await enviarConfirmacion(pedido, transporte), 'sin-cliente');
  assert.deepEqual(await mensajes(), []);
});

test('el correo va al email del cliente, con el número de pedido', async () => {
  const { transporte, mensajes } = transporteDePrueba();
  const pedido = (await buscarPedido(21))!;
  assert.equal(await enviarConfirmacion(pedido, transporte), 'enviado');
  const [mensaje, ...otros] = await mensajes();
  assert.deepEqual(otros, []);
  assert.deepEqual(
    mensaje.to.map((para: { address: string }) => para.address),
    ['carmen@ejemplo.com'],
  );
  assert.match(mensaje.subject, /\b21\b/);
  assert.match(mensaje.text, /\b21\b/);
  assert.ok(mensaje.from.address, 'lleva remitente');
});

test('un servidor de correo que no contesta hace fallar el correo en unos 5 segundos', async () => {
  // Acepta la conexión y no dice nada: SMTP empieza con el saludo del servidor, que no llega nunca.
  const conexiones = new Set<Socket>();
  const mudo = createServer((conexion) => conexiones.add(conexion)).listen(0, '127.0.0.1');
  await once(mudo, 'listening');
  try {
    const { port } = mudo.address() as AddressInfo;
    const transporte = crearTransporte(`smtp://127.0.0.1:${port}`);
    const pedido = (await buscarPedido(21))!;
    const antes = Date.now();
    // Un error: la cola lo reintentará. Con las esperas de Nodemailer serían 30 segundos.
    // ETIMEDOUT: el saludo que no llega o la conexión callada, lo que salte antes (los dos, a 5 s).
    await assert.rejects(enviarConfirmacion(pedido, transporte), { code: 'ETIMEDOUT' });
    const tardado = Date.now() - antes;
    assert.ok(tardado >= 4500 && tardado < 7000, `ha tardado ${tardado} ms`);
  } finally {
    for (const conexion of conexiones) conexion.destroy();
    mudo.close();
  }
});
