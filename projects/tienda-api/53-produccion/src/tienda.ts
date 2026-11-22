// La tienda en el navegador: una página HTML, hecha en el servidor, con la lista de productos. Es
// la página que un cliente vería; aquí sirve para ver XSS (lección 6): qué pasa cuando un dato
// acaba dentro del HTML.
import { Hono } from 'hono';
import { html } from 'hono/html';
import { secureHeaders } from 'hono/secure-headers';
import { listarProductos, type Producto } from './datos.ts';

// #region pagina
// html`…` no pega el texto tal cual: cada ${…} se escapa. < pasa a ser &lt;, > a &gt;, " a &quot;…
// Así, un producto que se llame <img src=x onerror=alert(1)> se ve como esas letras, y el
// navegador no lo lee como una etiqueta. Escapar depende del sitio: esto vale para el texto de
// una página HTML; dentro de un <script> o de una URL, las reglas son otras.
const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export function paginaTienda(productos: Producto[]) {
  return html`<!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>La tienda de Ana y Luis</title>
      </head>
      <body>
        <h1>La tienda de Ana y Luis</h1>
        <ul>
          ${productos.map(
            (producto) =>
              html`<li>${producto.nombre}: ${euros.format(producto.precioCentimos / 100)}</li>`,
          )}
        </ul>
      </body>
    </html>`;
}
// #endregion pagina

// #region csp
// La segunda muralla, por si algún día se cuela algo sin escapar: Content Security Policy. Le dice
// al navegador de dónde puede cargar cada cosa esta página. default-src 'self': todo, solo de esta
// misma web. Y nada de scripts escritos dentro de la página (ni <script>…</script>, ni onerror=…):
// script-src 'self' no los permite. Si se colara uno, el navegador no lo ejecutaría, y lo diría en
// la consola de DevTools.
export const POLITICA = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  objectSrc: ["'none'"], // nada de plugins (<object>, <embed>)
  baseUri: ["'none'"], // nadie cambia la base de las URL relativas con <base>
  frameAncestors: ["'none'"], // ninguna web puede meter esta página en un <iframe>
  formAction: ["'self'"], // los formularios solo se mandan aquí
};

export const tienda = new Hono();
tienda.use(secureHeaders({ contentSecurityPolicy: POLITICA }));

tienda.get('/', async (c) => c.html(paginaTienda(await listarProductos())));
// #endregion csp
