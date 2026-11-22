// WRONG ON PURPOSE: the shop's page (src/shop.ts) made by pasting texts, without escaping anything.
// It's for reading next to src/shop.ts and seeing the difference: it's never mounted in the API or
// served. A test checks it (test/injection-xss.test.ts): a tag in a name arrives whole.
import type { Product } from '../src/data.ts';

// #region pasting
// WRONG: the product's name, pasted inside the HTML as is. If the name brings tags, the browser
// reads them as tags: <img src=x onerror=alert(1)> is an image that doesn't load, and when it fails
// it runs onerror's JavaScript. That JavaScript could read the page, make requests to the API as
// you… The only thing it can't read is the session cookie: it's HttpOnly (lesson 2).
export function unsafePage(products: Product[]): string {
  let list = '';
  for (const product of products) list += `<li>${product.name}</li>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>The shop</title></head>
<body><h1>Ana and Luis's shop</h1><ul>${list}</ul></body></html>`;
}
// #endregion pasting
