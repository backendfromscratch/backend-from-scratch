// Rate limiting (lección 8): cuántas veces se puede intentar algo en un rato. Sin límite, quien
// quiere entrar en la cuenta de Ana prueba contraseñas sin parar (fuerza bruta); con 10 intentos
// cada 15 minutos, probar las 1000 más usadas le lleva un día entero, y se nota.
import type { Context } from 'hono';
import { getConnInfo } from '@hono/node-server/conninfo';
import { conectarRedis, crearAlmacenRedis } from './almacen-redis.ts';
import { config, normalizarIp } from './config.ts';
import { problema, tipo } from './problemas.ts';

// #region almacen
// Dónde se guardan los intentos. Aquí, en la memoria del servidor: si se reinicia, se olvidan, y
// con dos servidores cada uno llevaría su cuenta. Con Redis (almacen-redis.ts, Fase 7), la cuenta
// es una, compartida por todos: es otro almacén con estas dos funciones, sin tocar el resto.
export interface AlmacenLimites {
  /** Los instantes (en ms) de los intentos de esa clave posteriores a «desde», del más antiguo al más nuevo. */
  intentos(clave: string, desde: number): Promise<number[]>;
  /** Apunta un intento de esa clave en ese instante. */
  apuntar(clave: string, instante: number): Promise<void>;
}

export function crearAlmacenEnMemoria(): AlmacenLimites {
  const porClave = new Map<string, number[]>();
  return {
    async intentos(clave, desde) {
      // Los que ya han salido de la ventana se olvidan; una clave sin intentos, también.
      const recientes = (porClave.get(clave) ?? []).filter((instante) => instante > desde);
      if (recientes.length === 0) porClave.delete(clave);
      else porClave.set(clave, recientes);
      return recientes;
    },
    async apuntar(clave, instante) {
      porClave.set(clave, [...(porClave.get(clave) ?? []), instante]);
    },
  };
}
// #endregion almacen

// #region limitador
// El algoritmo: ventana deslizante. Para decidir, se cuentan los intentos de los últimos 15
// minutos, contados desde ahora mismo (no desde las 10:00, las 10:15…). Es el más fácil de
// explicar y el más exacto: con una ventana fija, quien hace 10 intentos a las 10:14 y otros 10 a
// las 10:15 hace 20 en dos minutos. A cambio, guarda cada intento; con un máximo de 10, no pesa.
export interface Limite {
  nombre: string; // para las cabeceras: "sesion-email"
  maximo: number; // cuántos intentos caben en la ventana
  ventana: number; // en segundos
}

export interface Estado {
  permitido: boolean;
  quedan: number; // cuántos intentos quedan ahora mismo
  reintentarEn: number; // si no se permite, en cuántos segundos se libera un hueco
  reinicioEn: number; // en cuántos segundos sale de la ventana el intento más antiguo
}

// reloj: de dónde sale la hora. Los tests le dan uno propio, para hacer pasar 15 minutos al momento.
export function crearLimitador(
  limite: Limite,
  almacen: AlmacenLimites = crearAlmacenEnMemoria(),
  reloj: () => number = Date.now,
) {
  const ventana = limite.ventana * 1000;
  const clave = (de: string) => `${limite.nombre}:${de}`;
  return {
    limite,
    // Mira cómo está esa clave, sin apuntar nada.
    async comprobar(de: string): Promise<Estado> {
      const ahora = reloj();
      const intentos = await almacen.intentos(clave(de), ahora - ventana);
      const segundosHasta = (instante: number) => Math.ceil((instante + ventana - ahora) / 1000);
      const permitido = intentos.length < limite.maximo;
      return {
        permitido,
        quedan: Math.max(0, limite.maximo - intentos.length),
        // Para que quepa otro, tiene que salir el que deja dentro justo «maximo» intentos.
        reintentarEn: permitido ? 0 : segundosHasta(intentos[intentos.length - limite.maximo]!),
        reinicioEn: intentos.length === 0 ? 0 : segundosHasta(intentos[0]!),
      };
    },
    // Apunta un intento ahora.
    async apuntar(de: string): Promise<void> {
      await almacen.apuntar(clave(de), reloj());
    },
  };
}

export type Limitador = ReturnType<typeof crearLimitador>;
// #endregion limitador

// #region almacen-elegido
// Con REDIS_URL (en Docker Compose), los intentos van a Redis, compartidos por todas las copias de
// la API; sin ella, a la memoria de este servidor, como hasta ahora.
const almacen = config.REDIS_URL
  ? crearAlmacenRedis(conectarRedis(config.REDIS_URL))
  : crearAlmacenEnMemoria();
// #endregion almacen-elegido

// #region limites-tienda
// Los límites de la tienda. Al iniciar sesión cuentan solo los fallos, y por dos lados: por email
// (protege cada cuenta, aunque el ataque llegue desde mil IP) y por IP (frena a quien prueba muchas
// cuentas a la vez). La trampa del límite por email: cualquiera puede gastar los 10 intentos de
// Ana y dejarla fuera 15 minutos. Por eso es un rato, no un bloqueo para siempre. Y el de la IP
// es más alto, porque detrás de una IP puede haber una oficina entera, o una universidad.
export const limites = {
  sesionPorEmail: crearLimitador({ nombre: 'sesion-email', maximo: 10, ventana: 15 * 60 }, almacen),
  sesionPorIp: crearLimitador({ nombre: 'sesion-ip', maximo: 30, ventana: 15 * 60 }, almacen),
  // Crear cuentas: cada intento cuenta, salga bien o mal.
  cuentasPorIp: crearLimitador({ nombre: 'cuentas-ip', maximo: 5, ventana: 60 * 60 }, almacen),
};
// #endregion limites-tienda

// #region ip
// La IP de quien hace la petición. Por defecto, la del otro lado de la conexión. Detrás de un proxy
// (Nginx, Fase 8) esa sería siempre la del proxy (con Docker, la puerta de enlace de la red, como
// 172.18.0.1), y la de verdad llega en X-Forwarded-For. Pero esa cabecera la puede escribir
// cualquiera, así que solo se lee si la conexión viene de una IP de PROXY_CONFIABLE; de cualquier
// otra, se ignora. Y se toma la última entrada de la lista, la que añadió nuestro proxy: las
// anteriores las pudo escribir el cliente. Con app.request (en los tests) no hay conexión, y se
// usa la que pase el test, o «desconocida».
export function ipDeConProxies(c: Context, proxies: string[]): string {
  let conexion: string;
  try {
    conexion = getConnInfo(c).remote.address ?? 'desconocida';
  } catch {
    return 'desconocida';
  }
  if (!proxies.map(normalizarIp).includes(normalizarIp(conexion))) return conexion;
  const ultima = c.req.header('X-Forwarded-For')?.split(',').at(-1)?.trim();
  return ultima ? ultima : conexion;
}

export function ipDe(c: Context): string {
  return ipDeConProxies(c, config.PROXY_CONFIABLE);
}
// #endregion ip

// #region cabeceras
// Las cabeceras RateLimit-Policy (las reglas) y RateLimit (cómo vas ahora) son de un borrador del
// IETF (draft-ietf-httpapi-ratelimit-headers), todavía no un estándar: q es el máximo, w la
// ventana en segundos, r los que quedan y t los segundos hasta que se libera uno.
export function ponerCabeceras(c: Context, comprobados: [Limitador, Estado][]) {
  const politicas = comprobados.map(
    ([{ limite }]) => `"${limite.nombre}";q=${limite.maximo};w=${limite.ventana}`,
  );
  const estados = comprobados.map(
    ([{ limite }, estado]) => `"${limite.nombre}";r=${estado.quedan};t=${estado.reinicioEn}`,
  );
  c.header('RateLimit-Policy', politicas.join(', '));
  c.header('RateLimit', estados.join(', '));
}

// 429 Too Many Requests, con Retry-After (RFC 9110): cuántos segundos esperar. Esta sí es estándar.
export function demasiadosIntentos(c: Context, comprobados: [Limitador, Estado][]) {
  ponerCabeceras(c, comprobados);
  const espera = Math.max(...comprobados.map(([, estado]) => estado.reintentarEn));
  return problema(
    c,
    {
      type: tipo('demasiados-intentos'),
      title: 'Demasiados intentos',
      status: 429,
      detail: `Espera ${espera} segundos y vuelve a intentarlo`,
    },
    { 'Retry-After': String(espera) },
  );
}
// #endregion cabeceras
