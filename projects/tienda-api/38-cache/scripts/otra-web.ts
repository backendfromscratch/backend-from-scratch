// Otra web, la de alguien que quiere usar tu sesión en la tienda (CSRF, lección 7). Con la tienda
// arrancada y tu sesión iniciada en http://localhost:3000, ejecútalo con: npm run otra-web
// y abre http://127.0.0.1:4000. Para el navegador, 127.0.0.1 y localhost son dos webs distintas.
// Solo para probar contra tu propia tienda, en tu ordenador.
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { html } from 'hono/html';

// #region pagina
// Dos intentos de hacer un pedido en tu nombre:
// 1. Un formulario que se manda a la tienda. El navegador no lleva la cookie de la sesión
//    (SameSite=Lax), y aunque la llevara, la tienda ve que Origin es http://127.0.0.1:4000: 403.
// 2. Un fetch con credentials: 'include' y JSON. Antes de mandarlo, el navegador pregunta a la
//    tienda (CORS, Fase 2) si acepta peticiones de esta web; la tienda no dice que sí, y el fetch
//    ni se manda.
export function paginaDeOtraWeb(tienda: string) {
  return html`<!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>¡Has ganado un premio!</title>
      </head>
      <body>
        <h1>¡Has ganado un premio!</h1>
        <form method="post" action="${tienda}/v2/pedidos">
          <input type="hidden" name="productoId" value="1" />
          <input type="hidden" name="cantidad" value="10" />
          <button>Recoger el premio (un formulario)</button>
        </form>
        <button id="fetch">Recoger el premio (con fetch)</button>
        <pre id="resultado"></pre>
        <script>
          document.getElementById('fetch').onclick = async () => {
            const resultado = document.getElementById('resultado');
            try {
              const res = await fetch('${tienda}/v2/pedidos', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productoId: 1, cantidad: 10 }),
              });
              resultado.textContent = res.status + ' ' + (await res.text());
            } catch (error) {
              resultado.textContent = 'El navegador no lo ha mandado: ' + error;
            }
          };
        </script>
      </body>
    </html>`;
}
// #endregion pagina

if (import.meta.main) {
  const tienda = process.env.TIENDA_URL ?? 'http://localhost:3000';
  const app = new Hono();
  app.get('/', (c) => c.html(paginaDeOtraWeb(tienda)));
  serve({ fetch: app.fetch, port: 4000, hostname: '127.0.0.1' }, () => {
    console.log(`La otra web, en http://127.0.0.1:4000: intenta hacer pedidos en ${tienda}`);
  });
}
