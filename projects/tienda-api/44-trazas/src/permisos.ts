// Autorización: qué puede hacer cada uno. La autenticación (lecciones 1 a 4) dice quién eres; esto
// dice qué te deja hacer la tienda. Es RBAC (control de acceso basado en roles): cada cuenta y cada
// clave tienen un rol, y cada rol, una lista de permisos.
import type { Context, MiddlewareHandler } from 'hono';
import type { Entorno } from './entorno.ts';
import { noIdentificado } from './middleware/sesion.ts';
import { problemaHttp } from './problemas.ts';

// #region permisos
export type Rol = 'cliente' | 'reparto' | 'admin';

export type Permiso =
  | 'pedidos:crear'
  | 'pedidos:ver-propios'
  | 'pedidos:ver-todos'
  | 'pedidos:cambiar-propios' // cambiar la cantidad y cancelar
  | 'pedidos:cambiar-todos'
  | 'pedidos:enviar' // marcar un pedido pagado como enviado
  | 'productos:gestionar' // crear y borrar productos
  | 'avisos:configurar'; // a dónde avisar de los pedidos pagados (lección 7)

// Cada rol, con lo justo para su trabajo (mínimo privilegio): la empresa de reparto ve los pedidos
// y los marca como enviados, pero no crea productos ni cancela nada. Si su clave se filtra, el daño
// se queda en eso.
const PERMISOS: Record<Rol, readonly Permiso[]> = {
  cliente: ['pedidos:crear', 'pedidos:ver-propios', 'pedidos:cambiar-propios'],
  reparto: ['pedidos:ver-todos', 'pedidos:enviar', 'avisos:configurar'],
  admin: ['pedidos:ver-todos', 'pedidos:cambiar-todos', 'pedidos:enviar', 'productos:gestionar'],
};
// #endregion permisos

// #region puede
// El rol de quien hace la petición: el de la persona de la sesión o el de la clave de API.
const rolDe = (c: Context<Entorno>): Rol | undefined => (c.var.usuario ?? c.var.clave)?.rol;

// El código pregunta por permisos, nunca por roles: «¿puede ver todos los pedidos?», y no «¿es
// admin?». Si mañana hay un rol nuevo (atención al cliente), basta con darle sus permisos aquí.
export function puede(c: Context<Entorno>, permiso: Permiso): boolean {
  const rol = rolDe(c);
  return rol !== undefined && PERMISOS[rol].includes(permiso);
}
// #endregion puede

// #region exigir
// Un middleware para cada ruta: deja pasar si tiene alguno de esos permisos. Si no sabe quién eres,
// 401 («identifícate»); si lo sabe y no puedes, 403 («sé quién eres, y no»).
export const exigir =
  (...permisos: Permiso[]): MiddlewareHandler<Entorno> =>
  async (c, next) => {
    if (rolDe(c) === undefined) return noIdentificado(c);
    if (!permisos.some((permiso) => puede(c, permiso))) {
      return problemaHttp(c, 403, 'Tu cuenta no tiene permiso para esto');
    }
    await next();
  };
// #endregion exigir
