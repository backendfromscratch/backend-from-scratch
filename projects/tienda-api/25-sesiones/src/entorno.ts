// Lo que los middleware dejan en el contexto de cada petición, para las rutas que vienen después.
// Hono lo guarda en c.var: c.var.usuario es quien ha iniciado sesión, o undefined si nadie.
import type { Usuario } from './usuarios.ts';

export interface Entorno {
  Variables: {
    usuario?: Usuario;
  };
}
