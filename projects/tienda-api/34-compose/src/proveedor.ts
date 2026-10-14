// La tienda como cliente de OpenID Connect: «Iniciar sesión con…» un proveedor de identidad. El
// flujo es el del código de autorización con PKCE (RFC 9700: el recomendado para todos). Lo hace
// openid-client; aquí está cada paso, para verlo.
import * as oidc from 'openid-client';
import { config } from './config.ts';
import { log } from './log.ts';

// #region descubrir
// Discovery: la tienda lee /.well-known/openid-configuration del proveedor, que dice dónde está
// cada cosa (a dónde mandar a la persona, dónde cambiar el código, dónde están sus claves). Se hace
// una vez, la primera vez que hace falta, y se guarda. Si falla, se vuelve a intentar la próxima.
let configuracion: Promise<oidc.Configuration> | undefined;

function proveedor(): Promise<oidc.Configuration> {
  configuracion ??= descubrir().catch((error) => {
    configuracion = undefined;
    throw error;
  });
  return configuracion;
}

async function descubrir() {
  const emisor = new URL(config.OIDC_EMISOR);
  // Un proveedor de verdad siempre habla HTTPS, y openid-client no acepta otra cosa. El de práctica
  // (npm run proveedor) habla HTTP en tu ordenador: solo para él, y solo en localhost, se permite.
  const dePractica =
    emisor.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(emisor.hostname);
  return oidc.discovery(
    emisor,
    config.OIDC_CLIENTE_ID,
    config.OIDC_CLIENTE_SECRETO,
    undefined,
    dePractica ? { execute: [oidc.allowInsecureRequests] } : undefined,
  );
}
// #endregion descubrir

// #region empezar
// Lo que la tienda guarda entre la ida y la vuelta, para comprobar la respuesta:
// - estado (state): un valor al azar que el proveedor devuelve tal cual. Si no coincide, esa vuelta
//   no la empezó este navegador: alguien intenta colarle su propio código (CSRF en el login).
// - nonce: otro valor al azar, que vuelve dentro del id_token. Ata el token a este inicio de sesión.
// - verificador (PKCE): un secreto al azar. Al proveedor solo le llega su hash (code_challenge); al
//   cambiar el código se manda el verificador, y así quien robe el código no puede usarlo.
export interface InicioGuardado {
  estado: string;
  nonce: string;
  verificador: string;
}

// #region ida
export async function empezarInicio(): Promise<{ url: URL; guardado: InicioGuardado }> {
  const guardado = {
    estado: oidc.randomState(),
    nonce: oidc.randomNonce(),
    verificador: oidc.randomPKCECodeVerifier(),
  };
  const url = oidc.buildAuthorizationUrl(await proveedor(), {
    redirect_uri: config.OIDC_VUELTA,
    // openid: queremos saber quién es (OpenID Connect, no solo OAuth); email y profile, sus datos.
    scope: 'openid email profile',
    code_challenge: await oidc.calculatePKCECodeChallenge(guardado.verificador),
    code_challenge_method: 'S256',
    state: guardado.estado,
    nonce: guardado.nonce,
  });
  return { url, guardado };
}
// #endregion ida
// #endregion empezar

// #region terminar
// Quién es la persona, según el proveedor.
export interface Identidad {
  sub: string;
  email?: string;
  emailVerificado: boolean;
}

// La vuelta: comprueba el state, cambia el código por los tokens (con el secreto de la tienda y el
// verificador) y comprueba el id_token: el emisor (iss), que es para esta tienda (aud), el nonce y
// que no ha caducado. Su firma no: el token llega directo del proveedor, y OpenID Connect permite
// fiarse de esa conexión. Si algo falla, devuelve undefined, y el motivo va al log.
export async function terminarInicio(
  vuelta: URL,
  guardado: InicioGuardado,
): Promise<Identidad | undefined> {
  try {
    // #region cambiar-codigo
    const tokens = await oidc.authorizationCodeGrant(await proveedor(), vuelta, {
      expectedState: guardado.estado,
      expectedNonce: guardado.nonce,
      pkceCodeVerifier: guardado.verificador,
      idTokenExpected: true,
    });
    // #endregion cambiar-codigo
    const datos = tokens.claims()!;
    return {
      sub: datos.sub,
      email: typeof datos.email === 'string' ? datos.email : undefined,
      emailVerificado: datos.email_verified === true,
    };
  } catch (error) {
    const delFlujo =
      error instanceof oidc.ClientError ||
      error instanceof oidc.ResponseBodyError ||
      error instanceof oidc.AuthorizationResponseError;
    if (!delFlujo) throw error;
    log.warn({ err: error }, 'inicio de sesión con el proveedor rechazado');
    return undefined;
  }
}
// #endregion terminar
