// Lo que los middleware dejan en el contexto de cada petición, para las rutas que vienen después.
// Hono lo guarda en c.var: c.var.usuario es la persona que ha iniciado sesión, y c.var.clave, el
// programa que se ha identificado con su clave de API. Si no hay nadie, los dos son undefined.
import type { ClaveApi } from './claves.ts';
import type { Usuario } from './usuarios.ts';

export interface Entorno {
  Variables: {
    usuario?: Usuario;
    clave?: ClaveApi;
  };
}
