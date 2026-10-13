// Una pasarela de pago de mentira: avisa a la tienda de que un pedido se ha pagado, con un
// webhook firmado. Con el servidor arrancado, en otra terminal:
//   npm run pasarela -- 3               el pedido 3, pagado
//   npm run pasarela -- 3 --manipular   alguien cambia el cuerpo por el camino
//   npm run pasarela -- 3 --repetir     el mismo aviso, dos veces
// Lee WEBHOOK_SECRET del .env, como el servidor: los dos tienen que conocer el mismo secreto.
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { firmar } from '../src/firma.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { manipular: { type: 'boolean' }, repetir: { type: 'boolean' } },
});
const pedidoId = Number(positionals[0]);
const secreto = process.env.WEBHOOK_SECRET;
if (!Number.isInteger(pedidoId) || secreto === undefined) {
  console.error(
    'Uso: npm run pasarela -- <pedidoId> [--manipular] [--repetir], con WEBHOOK_SECRET',
  );
  process.exit(1);
}
const tienda = process.env.TIENDA_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;

// #region enviar
// El evento lleva un id propio: si la tienda lo recibe dos veces, sabe que es el mismo.
const evento = { id: `evt_${randomUUID()}`, tipo: 'pago.completado', pedidoId };
const cuerpo = JSON.stringify(evento);
const firma = firmar(cuerpo, secreto);

async function enviar(cuerpoEnviado: string) {
  console.log(`→ POST /v2/webhooks/pagos ${cuerpoEnviado}`);
  const res = await fetch(`${tienda}/v2/webhooks/pagos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Firma': firma },
    body: cuerpoEnviado,
  });
  console.log(`← ${res.status} ${await res.text()}`);
}

// --manipular: alguien cambia el pedido por el camino, pero la firma es la del cuerpo original.
if (values.manipular) {
  await enviar(cuerpo.replace(`"pedidoId":${pedidoId}`, `"pedidoId":${pedidoId + 1}`));
} else {
  await enviar(cuerpo);
}
// --repetir: el mismo evento otra vez, como cuando la pasarela no recibe respuesta y reintenta.
if (values.repetir) await enviar(cuerpo);
// #endregion enviar
