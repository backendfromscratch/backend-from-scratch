import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paginaInsegura } from '../ejemplos/pagina-insegura.ts';
import { app } from '../src/app.ts';
import { listarProductos } from '../src/datos.ts';
import { ejecutar, usarBd } from './bd.ts';
import { ANA, comoUsuario } from './identidades.ts';

// Un producto con etiquetas en el nombre: lo crea Ana, que es admin.
const MALICIOSO = '<img src=x onerror=alert(1)>';
usarBd(async () => {
  const res = await app.request('/v2/productos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await comoUsuario(ANA)) },
    body: JSON.stringify({ nombre: MALICIOSO, precioCentimos: 100 }),
  });
  assert.equal(res.status, 201);
});

test('/tienda: una página HTML con los productos, y el nombre con etiquetas sale escapado', async () => {
  const res = await app.request('/tienda');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type')!, /^text\/html/);
  const pagina = await res.text();
  // Intl separa la cifra y el € con un espacio que no se parte (U+00A0).
  assert.match(pagina, /<li>Taza: 8,50\u00a0€<\/li>/);
  assert.ok(pagina.includes('<li>&lt;img src=x onerror=alert(1)&gt;: 1,00\u00a0€</li>'), pagina);
  assert.ok(!pagina.includes(MALICIOSO));
});

test('/tienda lleva la Content Security Policy: nada de scripts dentro de la página', async () => {
  const res = await app.request('/tienda');
  assert.equal(
    res.headers.get('content-security-policy'),
    "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; " +
      "frame-ancestors 'none'; form-action 'self'",
  );
});

test('las rutas JSON siguen igual, ahora con las cabeceras de seguridad', async () => {
  const res = await app.request('/v2/productos/2');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).nombre, 'Taza');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.match(res.headers.get('strict-transport-security')!, /^max-age=\d+/);
  assert.equal(res.headers.get('content-security-policy'), null);
  assert.equal((await app.request('/docs')).status, 200);
});

test('ejemplos/pagina-insegura.ts: pegando el nombre, la etiqueta llega entera al navegador', async () => {
  const pagina = paginaInsegura(await listarProductos());
  assert.ok(pagina.includes(`<li>${MALICIOSO}</li>`));
});

test('ejemplos/inyeccion.ts: con UNION, pegando el texto salen los emails y los hashes; con un parámetro, nada', async () => {
  const { stdout } = await ejecutar('node', ['ejemplos/inyeccion.ts']);
  const union = stdout.split('\nSe busca: ')[3]!;
  assert.match(union, /^x' UNION SELECT email \|\| ' ' \|\| hash_contrasena FROM usuarios --$/m);
  const pegando = union.slice(union.indexOf('Pegando'), union.indexOf('Con un parámetro'));
  for (const email of ['ana@tienda.example', 'luis@tienda.example', 'carmen@ejemplo.com']) {
    assert.match(pegando, new RegExp(`'${email} \\$argon2id\\$v=19\\$`));
  }
  assert.match(union, /Con un parámetro, encuentra: \[\]/);
});
