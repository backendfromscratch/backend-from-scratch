// MAL A PROPÓSITO: la página de la tienda (src/tienda.ts) hecha pegando textos, sin escapar nada.
// Es para leerla al lado de src/tienda.ts y ver la diferencia: nunca se monta en la API ni se
// sirve. La comprueba un test (test/inyeccion-xss.test.ts): una etiqueta en un nombre llega entera.
import type { Producto } from '../src/datos.ts';

// #region pegando
// MAL: el nombre del producto, pegado dentro del HTML tal cual. Si el nombre trae etiquetas, el
// navegador las lee como etiquetas: <img src=x onerror=alert(1)> es una imagen que no carga, y al
// fallar ejecuta el JavaScript de onerror. Ese JavaScript podría leer la página, hacer peticiones
// a la API como tú… Lo único que no puede leer es la cookie de la sesión: es HttpOnly (lección 2).
export function paginaInsegura(productos: Producto[]): string {
  let lista = '';
  for (const producto of productos) lista += `<li>${producto.nombre}</li>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8" /><title>La tienda</title></head>
<body><h1>La tienda de Ana y Luis</h1><ul>${lista}</ul></body></html>`;
}
// #endregion pegando
