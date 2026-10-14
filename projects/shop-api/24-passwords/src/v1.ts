// Version 1 of the API, the old one: prices in euros with decimals (price). It keeps working for
// the clients that still use it, but it's deprecated and has a retirement date. It stores nothing
// of its own: it reads and writes the same data as version 2 and only translates what changed.
import { Hono } from 'hono';
import { z } from 'zod';
import { createProduct, findProduct, listProducts, type Product } from './data.ts';
import { adminOnly } from './middleware/admin-only.ts';
import { validate } from './middleware/validate.ts';
import { httpProblem } from './problems.ts';
import { filterSchema, idSchema, nameSchema } from './schemas.ts';
import { v2 } from './v2.ts';

export const v1 = new Hono();

// #region warnings
// Since when it's deprecated (RFC 9745: the seconds since 1970, with an @ in front) and when it
// will stop working (RFC 8594: an HTTP date, like the one in Expires).
const DEPRECATED_SINCE = new Date('2026-10-13T00:00:00Z');
export const SUNSET = new Date('2027-04-13T00:00:00Z');

// Every v1 response says so in its headers, and says where the same thing is in version 2.
v1.use(async (c, next) => {
  await next();
  c.header('Deprecation', `@${DEPRECATED_SINCE.getTime() / 1000}`);
  c.header('Sunset', SUNSET.toUTCString());
  const successor = c.req.path.replace(/^\/v1/, '/v2');
  // append: the response may already carry a Link (the next page) and it mustn't be deleted.
  c.header('Link', `<${successor}>; rel="successor-version"`, { append: true });
});
// #endregion warnings

// #region translate
// A product the way version 1 gave it: the price, in euros.
function productV1(product: Product) {
  return { id: product.id, name: product.name, price: product.priceCents / 100 };
}

// Version 1's schemas, with the price in euros.
const productSchemaV1 = z.object({
  name: nameSchema,
  price: z
    .number({ error: 'Must be a number' })
    .positive('Must be greater than 0')
    .max(10_000, 'At most €10,000'),
});

const filterSchemaV1 = z.object({
  max: z.coerce.number({ error: 'Must be a number' }).positive('Must be greater than 0').optional(),
  sort: filterSchema.shape.sort,
});
// #endregion translate

// #region read-v1
// Only the routes that changed: the ones that carry a price.
v1.get('/products', validate('query', filterSchemaV1), async (c) => {
  const { max, sort } = c.req.valid('query');
  let list = (await listProducts()).map(productV1);
  if (max !== undefined) list = list.filter((product) => product.price <= max);
  if (sort === 'price') list = list.toSorted((a, b) => a.price - b.price);
  if (sort === '-price') list = list.toSorted((a, b) => b.price - a.price);
  return c.json(list);
});

v1.get('/products/:id', validate('param', idSchema), async (c) => {
  const product = await findProduct(c.req.valid('param').id);
  if (!product) return httpProblem(c, 404, 'No such product');
  return c.json(productV1(product));
});
// #endregion read-v1

// #region create-v1
v1.post('/products', adminOnly, validate('json', productSchemaV1), async (c) => {
  const { name, price } = c.req.valid('json');
  // From euros to cents. Math.round, because 8.29 * 100 is 828.9999999999999.
  const product = await createProduct(name, Math.round(price * 100));
  return c.json(productV1(product), 201, { Location: `${c.req.path}/${product.id}` });
});

// Everything else (the orders, deleting a product) hasn't changed: version 2's routes handle it.
v1.route('/', v2);
// #endregion create-v1
