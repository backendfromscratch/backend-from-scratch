// Un proveedor de identidad OpenID Connect de práctica, como «Iniciar sesión con Google», pero en
// tu ordenador: http://localhost:9000. Ejecútalo con: npm run proveedor
// Es oauth2-mock-server, hecho para probar: no pide contraseña, da por buena a cualquier tienda y
// siempre dice que quien inicia sesión es Marta. Nunca lo uses fuera de tu ordenador.
import { Events, OAuth2Server } from 'oauth2-mock-server';

// #region persona
// La persona que «inicia sesión» en el proveedor. sub es su identificador en el proveedor, el que
// no cambia; email_verified: el proveedor ha comprobado que el email es suyo.
export const MARTA = {
  sub: 'proveedor-marta-0001',
  email: 'marta@ejemplo.com',
  email_verified: true,
  name: 'Marta Ruiz',
};
// #endregion persona

// #region arrancar
// Arranca el proveedor y devuelve el servidor. persona se puede cambiar mientras funciona (los tests
// lo hacen); avisar escribe lo que va pasando.
export async function arrancarProveedor(
  puerto: number,
  host: string,
  persona: Record<string, unknown> = MARTA,
  avisar: (texto: string) => void = () => {},
) {
  const proveedor = new OAuth2Server();
  // La clave con la que firma los id_token (RS256: un par de claves, Fase 0). La pública la
  // publica en /jwks, y la tienda la usa para comprobar la firma.
  await proveedor.issuer.keys.generate('RS256');

  // Antes de firmar cada token, le pone los datos de la persona.
  proveedor.service.on(Events.BeforeTokenSigning, (token) => {
    Object.assign(token.payload, persona);
  });
  proveedor.service.on(Events.BeforeAuthorizeRedirect, ({ url }) => {
    avisar(`/authorize: ${persona.name} inicia sesión. Vuelta a ${url.origin}${url.pathname}`);
    avisar(`  con code=${url.searchParams.get('code')} y state=${url.searchParams.get('state')}`);
  });
  proveedor.service.on(Events.BeforeResponse, (respuesta) => {
    const datos = respuesta.body as Record<string, unknown>;
    if ('id_token' in datos) avisar(`/token: el code se cambia por un id_token de ${persona.name}`);
    else avisar(`/token: ${respuesta.statusCode} ${JSON.stringify(datos)}`);
  });

  await proveedor.start(puerto, host);
  return proveedor;
}
// #endregion arrancar

if (import.meta.main) {
  // Escucha en 127.0.0.1, no en localhost: donde localhost es primero ::1 (IPv6), solo escucharía en
  // ::1, y la tienda, que prueba 127.0.0.1, no lo encontraría. Su URL sigue siendo localhost:9000.
  const proveedor = await arrancarProveedor(9000, '127.0.0.1', MARTA, console.log);
  console.log(`Proveedor de práctica en ${proveedor.issuer.url}`);
  console.log(`Su configuración: ${proveedor.issuer.url}/.well-known/openid-configuration`);
}
