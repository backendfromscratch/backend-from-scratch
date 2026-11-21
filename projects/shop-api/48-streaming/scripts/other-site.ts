// Another site, the one of someone who wants to use your session at the shop (CSRF, lesson 7).
// With the shop running and your session open at http://localhost:3000, run it with:
// npm run other-site and open http://127.0.0.1:4000. For the browser, 127.0.0.1 and localhost
// are two different sites. Only for trying against your own shop, on your computer.
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { html } from 'hono/html';

// #region page
// Two attempts to place an order in your name:
// 1. A form that is sent to the shop. The browser doesn't carry the session cookie
//    (SameSite=Lax), and even if it did, the shop sees that Origin is http://127.0.0.1:4000: 403.
// 2. A fetch with credentials: 'include' and JSON. Before sending it, the browser asks the shop
//    (CORS, Phase 2) whether it accepts requests from this site; the shop doesn't say yes, and the
//    fetch isn't even sent.
export function otherSitePage(shop: string) {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>You've won a prize!</title>
      </head>
      <body>
        <h1>You've won a prize!</h1>
        <form method="post" action="${shop}/v2/orders">
          <input type="hidden" name="productId" value="1" />
          <input type="hidden" name="quantity" value="10" />
          <button>Claim the prize (a form)</button>
        </form>
        <button id="fetch">Claim the prize (with fetch)</button>
        <pre id="result"></pre>
        <script>
          document.getElementById('fetch').onclick = async () => {
            const result = document.getElementById('result');
            try {
              const res = await fetch('${shop}/v2/orders', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId: 1, quantity: 10 }),
              });
              result.textContent = res.status + ' ' + (await res.text());
            } catch (error) {
              result.textContent = 'The browser has not sent it: ' + error;
            }
          };
        </script>
      </body>
    </html>`;
}
// #endregion page

if (import.meta.main) {
  const shop = process.env.SHOP_URL ?? 'http://localhost:3000';
  const app = new Hono();
  app.get('/', (c) => c.html(otherSitePage(shop)));
  serve({ fetch: app.fetch, port: 4000, hostname: '127.0.0.1' }, () => {
    console.log(`The other site, at http://127.0.0.1:4000: it tries to place orders at ${shop}`);
  });
}
