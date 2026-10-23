// El correo de confirmación (Fase 9, lección 1): cuando un pedido pasa a pagado, la tienda escribe
// a quien lo hizo. Lo manda el trabajador, como un trabajo de la cola (cola.ts): hablar con un
// servidor de correo tarda, y puede fallar, y la pasarela de pago no tiene por qué esperarlo.
// Nodemailer habla SMTP, el protocolo con el que se mandan los correos, con el servidor de
// SMTP_URL: en tu ordenador, Mailpit, que los guarda en una bandeja de entrada y no los manda a
// nadie (http://localhost:8025).
import { eq } from 'drizzle-orm';
import { createTransport, type Transporter } from 'nodemailer';
import { bd } from './bd.ts';
import { config } from './config.ts';
import type { Pedido } from './datos.ts';
import { usuarios } from './esquema.ts';
import { log } from './log.ts';

// El transporte de un servidor de correo, con esperas cortas. Las de Nodemailer, si no se dice
// otra cosa, son largas (hasta 2 minutos para conectar y 10 sin noticias del servidor): un servidor
// atascado tendría al trabajador esperando, y al apagarse (docker stop espera 10 segundos) lo
// matarían con el correo a medias, y la cola lo repetiría. Con 5 segundos como mucho en cada paso
// (conectar, el saludo del servidor y cada respuesta), falla pronto, y la cola lo reintenta.
const ESPERA_MAXIMA = 5000; // ms
export const crearTransporte = (url: string): Transporter =>
  createTransport({
    url,
    connectionTimeout: ESPERA_MAXIMA,
    greetingTimeout: ESPERA_MAXIMA,
    socketTimeout: ESPERA_MAXIMA,
  });

// Un solo transporte para todos los correos, creado la primera vez que hace falta.
let deLaConfig: Transporter | undefined;
const transporteDeLaConfig = () =>
  config.SMTP_URL ? (deLaConfig ??= crearTransporte(config.SMTP_URL)) : undefined;

// #region correo
// Devuelve qué ha pasado: enviado, sin servidor de correo (sin-smtp) o sin nadie a quien escribir
// (sin-cliente: los pedidos de antes de las cuentas, Fase 6, no son de nadie). Si el servidor de
// correo falla, lanza un error, y la cola lo reintenta. transporte: en los tests, uno que no manda
// nada.
export async function enviarConfirmacion(
  pedido: Pedido,
  transporte: Transporter | undefined = transporteDeLaConfig(),
): Promise<'enviado' | 'sin-smtp' | 'sin-cliente'> {
  if (pedido.clienteId === null) return 'sin-cliente';
  if (!transporte) {
    // En un servidor sin SMTP_URL, la tienda funciona igual: solo deja dicho qué correo no salió.
    log.info({ pedidoId: pedido.id }, 'sin SMTP_URL: el correo de confirmación no se manda');
    return 'sin-smtp';
  }
  const [cliente] = await bd
    .select({ email: usuarios.email })
    .from(usuarios)
    .where(eq(usuarios.id, pedido.clienteId));
  if (!cliente) return 'sin-cliente'; // la cuenta se ha borrado
  await transporte.sendMail({
    from: config.SMTP_REMITENTE,
    to: cliente.email,
    subject: `Tu pedido ${pedido.id} está pagado`,
    text:
      `Hola:\n\nHemos recibido el pago de tu pedido ${pedido.id}. ` +
      'Te avisaremos cuando salga hacia tu casa.\n\nGracias por comprar en la tienda.\n',
  });
  return 'enviado';
}
// #endregion correo
