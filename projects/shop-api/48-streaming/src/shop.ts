// The shop in the browser: an HTML page, made on the server, with the list of products. It's the
// page a customer would see; here it's for seeing XSS (lesson 6): what happens when a piece of data
// ends up inside the HTML.
import { Hono } from 'hono';
import { html } from 'hono/html';
import { secureHeaders } from 'hono/secure-headers';
import { listProducts, type Product } from './data.ts';

// #region page
// html`…` doesn't paste the text as is: each ${…} is escaped. < becomes &lt;, > &gt;, " &quot;…
// That way, a product called <img src=x onerror=alert(1)> shows up as those letters, and the
// browser doesn't read it as a tag. Escaping depends on the place: this is right for the text of
// an HTML page; inside a <script> or a URL, the rules are different.
const euros = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' });

export function shopPage(products: Product[]) {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Ana and Luis's shop</title>
      </head>
      <body>
        <h1>Ana and Luis's shop</h1>
        <ul>
          ${products.map(
            (product) => html`<li>${product.name}: ${euros.format(product.priceCents / 100)}</li>`,
          )}
        </ul>
      </body>
    </html>`;
}
// #endregion page

// #region csp
// The second wall, in case something unescaped slips in some day: Content Security Policy. It
// tells the browser where this page can load each thing from. default-src 'self': everything, only
// from this same site. And no scripts written inside the page (neither <script>…</script>, nor
// onerror=…): script-src 'self' doesn't allow them. If one slipped in, the browser wouldn't run it,
// and it would say so in the DevTools console.
export const POLICY = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  objectSrc: ["'none'"], // no plugins (<object>, <embed>)
  baseUri: ["'none'"], // nobody changes the base of relative URLs with <base>
  frameAncestors: ["'none'"], // no site can put this page in an <iframe>
  formAction: ["'self'"], // forms are only sent here
};

export const shop = new Hono();
shop.use(secureHeaders({ contentSecurityPolicy: POLICY }));

shop.get('/', async (c) => c.html(shopPage(await listProducts())));
// #endregion csp
