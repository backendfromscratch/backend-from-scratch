// La firma de los webhooks: así la tienda sabe que el aviso viene de la pasarela de pago y que
// nadie lo ha cambiado por el camino. La usan el servidor y la pasarela de mentira (scripts/).
import { createHmac, timingSafeEqual } from 'node:crypto';

// #region firmar
// Un HMAC-SHA256 del cuerpo, tal cual llega, con un secreto que solo conocen la pasarela y la
// tienda. Sin el secreto no se puede calcular; si cambia un solo byte del cuerpo, cambia entera.
export function firmar(cuerpo: string, secreto: string): string {
  return `sha256=${createHmac('sha256', secreto).update(cuerpo).digest('hex')}`;
}
// #endregion firmar

// #region comprobar
// Se calcula la firma que debería traer y se compara con la que trae. timingSafeEqual tarda lo
// mismo acierte o falle: con ===, quien mida el tiempo podría ir adivinándola letra a letra.
export function firmaValida(cuerpo: string, firma: string | undefined, secreto: string): boolean {
  if (firma === undefined) return false;
  const esperada = Buffer.from(firmar(cuerpo, secreto));
  const recibida = Buffer.from(firma);
  // timingSafeEqual solo compara dos cosas del mismo tamaño.
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}
// #endregion comprobar
