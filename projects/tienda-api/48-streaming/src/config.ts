// La configuración llega de las variables de entorno (Fase 1, lección 7). Se comprueba al
// arrancar: si falta algo, el servidor no arranca y dice qué falta.
import { isIP } from 'node:net';
import { z } from 'zod';

// Una lista separada por comas, como texto: «a, b» pasa a ser ['a', 'b'].
const lista = (nombre: string) =>
  z.string({ error: `Falta ${nombre}` }).transform((texto) =>
    texto
      .split(',')
      .map((parte) => parte.trim())
      .filter((parte) => parte !== ''),
  );

// Una IPv4 puede llegar escrita como IPv6 (::ffff:172.18.0.1): se deja como IPv4, para comparar
// siempre el mismo texto.
export const normalizarIp = (ip: string) =>
  ip.toLowerCase().startsWith('::ffff:') && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;

// #region secreto
// Un secreto (lección 8): tiene que estar, ser largo (32 caracteres, como los que da
// openssl rand -base64 32) y no ser el de ejemplo de .env.ejemplo, que está en Git y lo puede
// leer cualquiera. Si no, el servidor no arranca: mejor no arrancar que arrancar con un secreto
// que se adivina.
const secreto = (nombre: string) =>
  z
    .string({ error: `Falta ${nombre}` })
    .min(32, `${nombre} es demasiado corto: como mínimo, 32 caracteres`)
    .refine(
      (valor) => !valor.startsWith('cambia-esto'),
      `${nombre} es el de ejemplo: genera uno con openssl rand -base64 32`,
    );
// #endregion secreto

// #region esquema-config
const esquemaConfig = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    // La dirección en la que escucha: 127.0.0.1, solo tu ordenador (Fase 3). Dentro de un contenedor
    // no basta: lo que llega por el puerto publicado entra por la red del contenedor, no por su
    // 127.0.0.1. Allí hace falta 0.0.0.0 (todas sus direcciones), y lo pone el Dockerfile. Quién
    // llega al contenedor lo decide el puerto publicado: -p 127.0.0.1:3000:3000, solo tu ordenador.
    HOST: z.string().min(1).default('127.0.0.1'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    // El secreto con el que la pasarela de pago firma los webhooks (lección 7).
    WEBHOOK_SECRET: secreto('WEBHOOK_SECRET'),
    // El proveedor de identidad (lección 4): su dirección (el emisor), el id y el secreto que te dio
    // al registrar la tienda, y la URL de la tienda a la que vuelve el navegador. Son opcionales,
    // pero en grupo: o están las cuatro o no está ninguna (más abajo). Sin ellas, la tienda no
    // ofrece iniciar sesión con un proveedor, y el email y la contraseña siguen funcionando.
    OIDC_EMISOR: z.url({ error: 'OIDC_EMISOR no es una URL' }).optional(),
    OIDC_CLIENTE_ID: z.string().min(1, 'OIDC_CLIENTE_ID está vacío').optional(),
    OIDC_CLIENTE_SECRETO: secreto('OIDC_CLIENTE_SECRETO').optional(),
    OIDC_VUELTA: z.url({ error: 'OIDC_VUELTA no es una URL' }).optional(),
    // Las webs (origen: esquema, nombre y puerto) desde las que se aceptan peticiones que usan la
    // cookie de la sesión (lección 7), separadas por comas: http://localhost:3000,https://tienda.example
    ORIGENES_PERMITIDOS: lista('ORIGENES_PERMITIDOS').pipe(
      z.array(z.url({ error: 'Cada origen, una URL: http://localhost:3000' })).min(1),
    ),
    // Redis, para los límites de intentos (limites.ts): redis://servidor:6379. Sin ella, los intentos
    // se guardan en la memoria del servidor. En Docker Compose la pone compose.yaml.
    // Desde la Fase 9, también para la cola de trabajos (cola.ts): sin ella, los trabajos se hacen
    // en el mismo proceso, en cuanto llegan, y sin reintentos.
    REDIS_URL: z.url({ error: 'REDIS_URL no es una URL: redis://servidor:6379' }).optional(),
    // Y para los avisos de los cambios de los pedidos entre las copias de la API (eventos-pedidos.ts,
    // Fase 9, lección 3), por este canal. Los canales de Redis no son de una base de datos (la /1 de
    // redis://servidor:6379/1): son de todo el servidor. Si dos tiendas usan el mismo Redis (la de
    // pruebas y la de verdad, o los tests), cada una necesita el suyo.
    CANAL_PEDIDOS: z.string().min(1).default('tienda:pedidos'),
    // La caché (Fase 9, lección 2): otro Redis, configurado para perder datos sin que importe
    // (cache.ts). Sin ella, no hay caché: el catálogo se lee siempre de PostgreSQL. En Docker
    // Compose la pone compose.yaml.
    CACHE_URL: z.url({ error: 'CACHE_URL no es una URL: redis://servidor:6379' }).optional(),
    // El servidor de correo (Fase 9, lección 1): smtp://servidor:puerto, o smtps:// si la conexión
    // va cifrada desde el principio; con usuario y contraseña, smtps://usuario:contraseña@servidor:465.
    // En tu ordenador, Mailpit (compose.yaml). Sin ella, la tienda no manda correos: el log dice
    // cuál habría mandado.
    SMTP_URL: z
      .url({ protocol: /^smtps?$/, error: 'SMTP_URL no es una URL smtp:// ni smtps://' })
      .optional(),
    // Quién firma los correos. Con un proveedor de verdad, una dirección de tu dominio.
    SMTP_REMITENTE: z.string().min(1).default('La tienda <pedidos@tienda.example>'),
    // Las IP de tu proxy (Nginx), separadas por comas: solo de ellas se lee X-Forwarded-For para saber
    // la IP de quien pide (limites.ts). Sin proxy, vacío: esa cabecera se ignora. Solo se admite UN
    // salto de proxy (se lee la última entrada de X-Forwarded-For): con otro proxy delante (el de
    // Cloudflare, por ejemplo), el limitador vería las direcciones de ese proxy, no las de los visitantes.
    PROXY_CONFIABLE: lista('PROXY_CONFIABLE')
      .pipe(
        z.array(
          z
            .string()
            .refine((ip) => isIP(ip) !== 0, 'Cada proxy, una IP: 172.18.0.1 (no un nombre)'),
        ),
      )
      .transform((ips) => ips.map(normalizarIp))
      .default([]),
    // Si la API comprueba sus propias respuestas contra el contrato (contrato-respuestas.ts, Fase 10,
    // lección 3): no, no comprueba nada; registrar, avisa en el log de las que no lo cumplen; fallar,
    // responde un 500 en su lugar. Para los tests y el desarrollo, fallar; en producción, la
    // decisión es tuya (cuesta tiempo en cada respuesta).
    VALIDAR_RESPUESTAS: z.enum(['no', 'registrar', 'fallar']).default('no'),
    // Solo para desarrollo: nombres a los que la tienda puede mandar avisos por http, aunque estén en
    // tu ordenador (url-segura.ts). Separados por comas. En producción, vacío.
    AVISOS_HOSTS_DESARROLLO: lista('AVISOS_HOSTS_DESARROLLO').default([]),
    // #region asistente
    // El asistente de la tienda (Fase 11, lección 1): la clave de la API de Claude. Es un secreto:
    // va en .env, nunca en el código ni en el frontend (quien la tenga gasta a cuenta de la tienda).
    // Es opcional: sin ella, la tienda funciona igual y POST /v2/asistente responde 503. Vacía
    // (ANTHROPIC_API_KEY=, como en .env.ejemplo) cuenta como que no está.
    // La dirección de la API (ANTHROPIC_BASE_URL) no está aquí: la lee el SDK por su cuenta, y sin
    // ella usa la de Anthropic. Los tests la cambian por la de su modelo falso (test/modelo-falso.ts).
    ANTHROPIC_API_KEY: z
      .string()
      .trim()
      .optional()
      .transform((clave) => clave || undefined),
    // El modelo que contesta y cuánto se esfuerza (output_config.effort): con más esfuerzo piensa
    // más antes de contestar, y tarda y cuesta más.
    MODELO: z.string().min(1, 'MODELO está vacío').default('claude-haiku-5-5'),
    ESFUERZO: z
      .enum(['low', 'medium', 'high', 'xhigh', 'max'], {
        error: 'ESFUERZO tiene que ser low, medium, high, xhigh o max',
      })
      .default('low'),
    // Cuántas veces repite el SDK una petición que falla por algo pasajero (un 429, un 529, un
    // corte de red), y cuántos milisegundos espera cada intento como mucho (el SDK, si no se le
    // dice, espera 10 minutos). Los tests ponen 0 reintentos y 2 segundos (test/.env).
    MODELO_REINTENTOS: z.coerce.number().int().min(0).max(5).default(2),
    MODELO_TIEMPO_MAXIMO_MS: z.coerce.number().int().positive().default(15_000),
    // Lo que espera la tienda, como mucho, a la respuesta entera del asistente, con todo dentro:
    // los intentos, las esperas entre uno y otro y, desde la lección 3, las vueltas con
    // herramientas. Pasado ese tiempo, se cancela la llamada al modelo y el cliente recibe un 503.
    // Tiene que quedarse por debajo de los 60 segundos que nginx espera a la API
    // (proxy_read_timeout, en nginx/tienda.conf): si no, al cliente le llegaría un 504 de nginx,
    // sin Retry-After, en lugar del 503 de la tienda. Las cuentas, con los valores por defecto:
    // tres intentos de 15 s y, entre ellos, las esperas del SDK (medio segundo y uno, como mucho),
    // 46,5 s. Pero si la API contesta con retry-after (en un 429, en un 529…), el SDK espera lo que
    // diga antes de repetir, por largo que sea: su único límite es lo más que aguanta un
    // temporizador de Node, unos 24 días (si pide más, o cero, o algo que no se entiende, el SDK
    // vuelve a sus esperas cortas). Un retry-after: 120 son dos minutos esperando, y eso solo lo
    // corta este tiempo: 50 s, con 10 de margen para la base de datos y la red. Vale también en
    // streaming: es lo más que dura una respuesta. Los tests ponen 3 segundos.
    ASISTENTE_TIEMPO_MAXIMO_MS: z.coerce.number().int().positive().default(50_000),
    // #endregion asistente
  })
  .superRefine((datos, contexto) => {
    const ajustes = [
      'OIDC_EMISOR',
      'OIDC_CLIENTE_ID',
      'OIDC_CLIENTE_SECRETO',
      'OIDC_VUELTA',
    ] as const;
    const faltan = ajustes.filter((nombre) => datos[nombre] === undefined);
    // Con una o dos, la tienda arrancaría con un proveedor a medias: mejor decir cuáles faltan.
    if (faltan.length === 0 || faltan.length === ajustes.length) return;
    for (const nombre of faltan) {
      contexto.addIssue({
        code: 'custom',
        path: [nombre],
        message: `Falta ${nombre}: el proveedor de identidad necesita las cuatro OIDC_*, o ninguna`,
      });
    }
  });
// #endregion esquema-config

const resultado = esquemaConfig.safeParse(process.env);
if (!resultado.success) {
  for (const problema of resultado.error.issues) {
    console.error(`Configuración: ${problema.path.join('.')}: ${problema.message}`);
  }
  process.exit(1);
}

export const config = resultado.data;
