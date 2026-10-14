// Las contraseñas: cómo se guardan (un hash lento, con sal) y qué reglas tienen que cumplir.
// La tienda nunca guarda una contraseña: guarda su hash, y para comprobar una contraseña calcula
// el hash otra vez y compara los dos.
import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';

// #region parametros
// argon2id con el mínimo que recomienda OWASP (Password Storage Cheat Sheet): 19 MiB de memoria,
// 2 pasadas y 1 hilo. Es lento a propósito: unos 20 o 40 ms por hash. Para quien inicia sesión no se
// nota; para quien prueba mil millones de contraseñas, son años. Y necesita memoria, que es lo que
// más caro le sale a una tarjeta gráfica que prueba miles a la vez.
// crypto.argon2 viene con Node desde la versión 24.7, y la documentación de Node 26 ya no la marca
// como experimental. Con un Node más antiguo, la alternativa es el paquete @node-rs/argon2.
const PARAMETROS = {
  memory: 19_456, // en KiB: 19 MiB
  passes: 2,
  parallelism: 1,
  tagLength: 32, // el hash: 32 bytes
};
const BYTES_DE_SAL = 16;

// argon2 avisa con un callback, como las funciones antiguas de Node. promisify la convierte en una
// que devuelve una promesa, para usarla con await.
const calcular = promisify(argon2);
// #endregion parametros

// #region hashear
// Antes de nada, normalize('NFKC'): la ñ puede escribirse como una sola letra o como una n más una
// tilde, según el teclado. Normalizada, la misma contraseña da siempre los mismos bytes.
// La sal: 16 bytes al azar, distintos en cada hash. Con ella, dos personas con la misma contraseña
// tienen hashes distintos, y una tabla de hashes precalculados (rainbow table) no sirve de nada.
export async function hashear(contrasena: string): Promise<string> {
  const sal = randomBytes(BYTES_DE_SAL);
  const hash = await calcular('argon2id', {
    ...PARAMETROS,
    message: contrasena.normalize('NFKC'),
    nonce: sal,
  });
  // El formato PHC: el algoritmo, su versión, los parámetros, la sal y el hash, separados por $.
  // Con todo eso en el mismo texto, verificar() sabe cómo repetir el cálculo, aunque mañana se
  // suban los parámetros para las contraseñas nuevas.
  const { memory: m, passes: t, parallelism: p } = PARAMETROS;
  return `$argon2id$v=19$m=${m},t=${t},p=${p}$${enBase64(sal)}$${enBase64(hash)}`;
}

// PHC usa base64 sin el relleno (=) del final.
const enBase64 = (bytes: Buffer) => bytes.toString('base64').replace(/=+$/, '');
// #endregion hashear

// #region verificar
// Repite el cálculo con la sal y los parámetros guardados, y compara. timingSafeEqual tarda lo
// mismo acierte o falle (Fase 4, la firma de los webhooks).
export async function verificar(contrasena: string, guardado: string): Promise<boolean> {
  const [, algoritmo, version, parametros, sal, hash] = guardado.split('$');
  const numeros = /^m=(\d+),t=(\d+),p=(\d+)$/.exec(parametros ?? '');
  if (algoritmo !== 'argon2id' || version !== 'v=19' || !numeros || !sal || !hash) return false;
  const esperado = Buffer.from(hash, 'base64');
  const calculado = await calcular('argon2id', {
    memory: Number(numeros[1]),
    passes: Number(numeros[2]),
    parallelism: Number(numeros[3]),
    tagLength: esperado.length,
    message: contrasena.normalize('NFKC'),
    nonce: Buffer.from(sal, 'base64'),
  });
  return timingSafeEqual(calculado, esperado);
}
// #endregion verificar

// #region reglas
// Las reglas de NIST (SP 800-63B-4): una longitud mínima y una lista de contraseñas conocidas. Nada
// de «una mayúscula, un número y un símbolo», ni de cambiarla cada tres meses: con esas reglas la
// gente acaba en Contraseña1! y Contraseña2!, fáciles de adivinar.
const MINIMO = 15; // NIST: 15 para una contraseña que se usa sola, sin un segundo factor
const MAXIMO = 128; // un tope generoso: NIST pide aceptar al menos 64

// Las contraseñas comunes, en minúsculas, en un Set: buscar en él es inmediato. Las líneas que
// empiezan por # son comentarios del fichero.
const COMUNES = new Set(
  readFileSync(new URL('contrasenas-comunes.txt', import.meta.url), 'utf8')
    .split('\n')
    .filter((linea) => linea !== '' && !linea.startsWith('#'))
    .map((linea) => linea.toLowerCase()),
);

// Devuelve qué le pasa a la contraseña, o undefined si vale. La longitud se cuenta en caracteres:
// [...texto] separa los emojis y las letras raras, que en JavaScript ocupan dos «letras» de length.
export function problemaDeContrasena(contrasena: string): string | undefined {
  const caracteres = [...contrasena.normalize('NFKC')].length;
  if (caracteres < MINIMO) return `Como mínimo, ${MINIMO} caracteres: una frase vale`;
  if (caracteres > MAXIMO) return `Como máximo, ${MAXIMO} caracteres`;
  if (COMUNES.has(contrasena.toLowerCase())) {
    return 'Es una de las contraseñas más usadas: es lo primero que se prueba';
  }
  return undefined;
}
// #endregion reglas
