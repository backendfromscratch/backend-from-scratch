// Un JWT (JSON Web Token) por dentro: cómo se hace, qué lleva, quién lo puede leer y qué se rechaza
// al comprobarlo. Con la biblioteca jose. Ejecútalo con: node ejemplos/jwt.ts
// No necesita la base de datos. La tienda no usa JWT para iniciar sesión (usa sesiones, lección 2):
// este ejemplo es para ver qué es y qué puede salir mal.
import { randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

// #region secreto
// HS256 firma con un HMAC-SHA256 (Fase 4) y un secreto que solo conoce quien firma y quien
// comprueba. Sale de JWT_SECRETO si existe; si no, uno al azar cada vez que se ejecuta.
const secreto = new TextEncoder().encode(
  process.env.JWT_SECRETO ?? randomBytes(32).toString('hex'),
);
// #endregion secreto

// #region crear
// El token dice quién es (sub), quién lo emite (iss), para quién es (aud) y hasta cuándo vale
// (exp). caduca: un texto como '15m' o los segundos desde 1970.
export function crearToken(sub: string, aud = 'tienda-api', caduca: string | number = '15m') {
  return new SignJWT({ rol: 'cliente' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(sub)
    .setIssuer('tienda-api')
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(caduca)
    .sign(secreto);
}
// #endregion crear

// #region leer
// Las tres partes, separadas por puntos: cabecera, datos y firma, cada una en base64url. Para leer
// las dos primeras basta con deshacer el base64url: sin secreto, sin jose. Un JWT está firmado,
// no cifrado: nunca pongas en él nada que no pueda ver quien lo tenga.
export function leerPartes(token: string) {
  const [cabecera, datos, firma] = token.split('.');
  return {
    cabecera: JSON.parse(Buffer.from(cabecera!, 'base64url').toString()),
    datos: JSON.parse(Buffer.from(datos!, 'base64url').toString()),
    bytesDeFirma: Buffer.from(firma!, 'base64url').length,
  };
}
// #endregion leer

// #region comprobar
// Comprobar es más que leer: la firma (¿lo firmó quien tiene el secreto?, ¿ha cambiado algo?), el
// algoritmo (solo HS256: nunca el que diga el propio token), el emisor, la audiencia y la
// caducidad. Si algo falla, jose lanza un error con un código que dice qué.
export async function comprobar(token: string, aud = 'tienda-api') {
  try {
    const { payload } = await jwtVerify(token, secreto, {
      algorithms: ['HS256'],
      issuer: 'tienda-api',
      audience: aud,
    });
    return { valido: true as const, datos: payload };
  } catch (error) {
    return { valido: false as const, motivo: (error as { code?: string }).code ?? String(error) };
  }
}
// #endregion comprobar

// #region romper
// Alguien cambia los datos (sub: pablo en vez de carmen) y deja la firma que tenía: ya no corresponde.
export function manipular(token: string, sub: string) {
  const [cabecera, datos, firma] = token.split('.');
  const cambiados = { ...JSON.parse(Buffer.from(datos!, 'base64url').toString()), sub };
  return [cabecera, Buffer.from(JSON.stringify(cambiados)).toString('base64url'), firma].join('.');
}

// El ataque de alg: none: una cabecera que dice «este token no lleva firma», y la firma, vacía.
// Una biblioteca que hiciera caso al token lo aceptaría. jose no: el algoritmo lo decide quien
// comprueba (algorithms, arriba).
export function sinFirma(token: string) {
  const [, datos] = token.split('.');
  const cabecera = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  return `${cabecera}.${datos}.`;
}
// #endregion romper

// #region probar
// import.meta.main: solo si se ejecuta este fichero (node ejemplos/jwt.ts), no si otro lo importa
// (los tests usan sus funciones).
if (import.meta.main) {
  const token = await crearToken('carmen');
  console.log(`El token:\n${token}\n`);
  const { cabecera, datos, bytesDeFirma } = leerPartes(token);
  console.log('Cabecera:', cabecera);
  console.log('Datos:', datos);
  console.log(`Firma: ${bytesDeFirma} bytes\n`);

  const casos = [
    ['Tal cual', token],
    ['Con los datos cambiados', manipular(token, 'pablo')],
    ['Con alg: none y sin firma', sinFirma(token)],
    [
      'Caducado hace un minuto',
      await crearToken('carmen', 'tienda-api', Math.floor(Date.now() / 1000) - 60),
    ],
    ['Para otra audiencia', await crearToken('carmen', 'pasarela-de-pago')],
  ] as const;
  for (const [nombre, probado] of casos) {
    const resultado = await comprobar(probado);
    console.log(`${nombre}: ${resultado.valido ? 'vale' : `rechazado (${resultado.motivo})`}`);
  }
}
// #endregion probar
