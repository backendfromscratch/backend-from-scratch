// MAL A PROPÓSITO: la página de la tienda (src/tienda.ts) hecha pegando textos, sin escapar nada.
// Es para ver XSS en tu propio ordenador, y nunca se monta en la API. Ejecútalo con:
//   node --env-file=.env ejemplos/pagina-insegura.ts
// y abre http://localhost:3001 (sin CSP) y http://localhost:3001/con-csp (la misma página, con la
// Content Security Policy de la tienda). Antes, como admin, crea un producto que se llame
// <img src=x onerror=alert(1)>.
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { listarProductos, type Producto } from '../src/datos.ts';
import { POLITICA } from '../src/tienda.ts';

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

// #region servir
// La misma página, dos veces: sin CSP, el script se ejecuta; con la CSP de la tienda, el navegador
// lo bloquea y lo cuenta en la consola de DevTools. La CSP no arregla la página (sigue rota): solo
// impide que el script se ejecute. El arreglo de verdad es escapar, como hace src/tienda.ts.
if (import.meta.main) {
  const app = new Hono();
  app.get('/', async (c) => c.html(paginaInsegura(await listarProductos())));
  app.get('/con-csp', secureHeaders({ contentSecurityPolicy: POLITICA }), async (c) =>
    c.html(paginaInsegura(await listarProductos())),
  );
  serve({ fetch: app.fetch, port: 3001, hostname: '127.0.0.1' }, () => {
    console.log('La página insegura, en http://localhost:3001 y http://localhost:3001/con-csp');
  });
}
// #endregion servir
