// Mandar una petición a una URL que ha dado otro, sin que la use para llegar a donde solo llega el
// servidor (SSRF, lección 7): la base de datos en localhost:5432, la red interna de la empresa o
// los metadatos de la nube en 169.254.169.254, que guardan las credenciales del servidor.
import { lookup } from 'node:dns/promises';
import { request as pedirHttp, type IncomingMessage } from 'node:http';
import { request as pedirHttps } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { config } from './config.ts';

export interface Direccion {
  address: string;
  family: number; // 4 o 6
}

// Quién convierte un nombre en direcciones. El de verdad pregunta al DNS; los tests usan uno suyo,
// para no salir del ordenador.
export type Resolver = (nombre: string) => Promise<Direccion[]>;
const resolverDns: Resolver = (nombre) => lookup(nombre, { all: true });

export interface Opciones {
  resolver?: Resolver;
  // Nombres para los que se permite http y una dirección interna: solo en desarrollo, para probar
  // con un servidor en tu ordenador. Si no se dice otra cosa, los de AVISOS_HOSTS_DESARROLLO.
  hostsDeDesarrollo?: string[];
}

// #region prohibidas
// Las direcciones a las que nunca se manda nada: las que no son de internet, sino del propio
// servidor o de su red. Una dirección IPv4 escrita como IPv6 (::ffff:127.0.0.1) también cuenta:
// BlockList la compara con las reglas de IPv4.
const PROHIBIDAS = new BlockList();
PROHIBIDAS.addSubnet('0.0.0.0', 8); // «esta red»
PROHIBIDAS.addSubnet('10.0.0.0', 8); // privada
PROHIBIDAS.addSubnet('100.64.0.0', 10); // compartida por los operadores (CGNAT)
PROHIBIDAS.addSubnet('127.0.0.0', 8); // loopback: el propio servidor
PROHIBIDAS.addSubnet('169.254.0.0', 16); // link-local: aquí están los metadatos de la nube
PROHIBIDAS.addSubnet('172.16.0.0', 12); // privada
PROHIBIDAS.addSubnet('192.168.0.0', 16); // privada
PROHIBIDAS.addSubnet('224.0.0.0', 4); // multicast
PROHIBIDAS.addSubnet('240.0.0.0', 4); // reservada, con 255.255.255.255
PROHIBIDAS.addAddress('::', 'ipv6'); // «ninguna»
PROHIBIDAS.addAddress('::1', 'ipv6'); // loopback
PROHIBIDAS.addSubnet('fc00::', 7, 'ipv6'); // unique-local: las privadas de IPv6
PROHIBIDAS.addSubnet('fe80::', 10, 'ipv6'); // link-local
PROHIBIDAS.addSubnet('ff00::', 8, 'ipv6'); // multicast
// #endregion prohibidas

// #region comprobar-url
// Comprueba la URL y devuelve la dirección a la que hay que conectar, o el motivo para no hacerlo.
export async function comprobarUrl(
  texto: string,
  opciones: Opciones = {},
): Promise<{ url: URL; direccion: Direccion } | { error: string }> {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return { error: 'No es una URL' };
  }
  if (url.username || url.password)
    return { error: 'La URL no puede llevar usuario ni contraseña' };
  const nombre = url.hostname.replace(/^\[(.*)\]$/, '$1'); // una IPv6 va entre corchetes: [::1]
  const deDesarrollo = (opciones.hostsDeDesarrollo ?? config.AVISOS_HOSTS_DESARROLLO).includes(
    nombre,
  );

  // 1. Solo https: lo que viaja no lo lee nadie por el camino. http, solo en desarrollo.
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && deDesarrollo)) {
    return { error: 'Tiene que empezar por https://' };
  }
  // 2. El nombre, convertido en direcciones (si ya es una dirección, esa).
  const familia = isIP(nombre);
  const direcciones =
    familia !== 0
      ? [{ address: nombre, family: familia }]
      : await (opciones.resolver ?? resolverDns)(nombre).catch(() => []);
  if (direcciones.length === 0) return { error: `No se encuentra ${nombre}` };
  // 3. Ninguna puede ser interna. Mirar el nombre no basta: cualquiera puede crear un nombre que
  //    apunte a 127.0.0.1. Lo que cuenta es la dirección.
  if (!deDesarrollo) {
    const interna = direcciones.find((direccion) =>
      PROHIBIDAS.check(direccion.address, direccion.family === 6 ? 'ipv6' : 'ipv4'),
    );
    if (interna) return { error: `Apunta a una dirección interna (${interna.address})` };
  }
  return { url, direccion: direcciones[0]! };
}
// #endregion comprobar-url

// #region enviar
const TIEMPO_MAXIMO = 5000; // ms
const TAMANO_MAXIMO = 64 * 1024; // bytes de respuesta: no hace falta más para saber si llegó

// Manda un POST con un cuerpo JSON (ya en texto: así la firma es de estos bytes exactos). Devuelve
// el código de la respuesta, o el motivo por el que no se ha mandado o no ha llegado.
export async function enviarJson(
  texto: string,
  cuerpo: string,
  cabeceras: Record<string, string>,
  opciones: Opciones = {},
): Promise<{ status: number } | { error: string }> {
  const comprobada = await comprobarUrl(texto, opciones);
  if ('error' in comprobada) return comprobada;
  const { url, direccion } = comprobada;

  // 4. Se conecta a la dirección comprobada, sin preguntar otra vez al DNS: la segunda respuesta
  //    podría ser otra (127.0.0.1), y la comprobación no habría servido de nada (DNS rebinding).
  const conLaComprobada = ((_nombre, opcionesDns, listo) => {
    if (opcionesDns.all) listo(null, [direccion]);
    else listo(null, direccion.address, direccion.family);
  }) as LookupFunction;

  const pedir = url.protocol === 'https:' ? pedirHttps : pedirHttp;
  return new Promise((resolver) => {
    const peticion = pedir(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...cabeceras },
        lookup: conLaComprobada,
        timeout: TIEMPO_MAXIMO, // 5. Si no contesta a tiempo, se corta
      },
      (respuesta: IncomingMessage) => {
        const status = respuesta.statusCode ?? 0;
        // 6. Las redirecciones no se siguen: una 302 podría llevar a una dirección interna.
        if (status >= 300 && status < 400) {
          respuesta.destroy();
          return resolver({ error: `Responde ${status}, una redirección: no se sigue` });
        }
        // 7. La respuesta se lee con un tope: una enorme llenaría la memoria del servidor.
        let leidos = 0;
        respuesta.on('data', (trozo: Buffer) => {
          leidos += trozo.length;
          if (leidos > TAMANO_MAXIMO) {
            respuesta.destroy();
            resolver({ error: 'La respuesta es demasiado grande' });
          }
        });
        respuesta.on('end', () => resolver({ status }));
      },
    );
    peticion.on('timeout', () => peticion.destroy(new Error('no contesta a tiempo')));
    peticion.on('error', (error) =>
      resolver({ error: `No se ha podido mandar: ${error.message}` }),
    );
    peticion.end(cuerpo);
  });
}
// #endregion enviar
