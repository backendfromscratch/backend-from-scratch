import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { app } from '../src/app.ts';
import { pool } from '../src/bd.ts';
import { crearClave } from '../src/claves.ts';
import { ejecutar, usarBd } from './bd.ts';

usarBd();

const yo = (cabeceras: Record<string, string>) => app.request('/v2/yo', { headers: cabeceras });

test('npm run crear-clave: la enseña una vez, y en la tabla solo queda su hash', async () => {
  const { stdout } = await ejecutar('node', ['scripts/crear-clave.ts', 'Reparto Rápido']);
  const clave = /^(tienda_[\w-]{43})$/m.exec(stdout)?.[1];
  assert.ok(clave, stdout);
  assert.match(stdout, /^Clave \d+, para «Reparto Rápido» \(rol reparto\):$/m);
  const { rows } = await pool.query(`SELECT nombre, hash FROM claves_api`);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].hash, createHash('sha256').update(clave).digest());
  const { rows: enClaro } = await pool.query(
    `SELECT count(*)::int AS n FROM claves_api WHERE encode(hash, 'escape') LIKE $1`,
    [`%${clave.slice(7)}%`],
  );
  assert.equal(enClaro[0].n, 0, 'la clave no está en la tabla');
});

test('con la clave como Bearer, /v2/yo dice que es una clave, y se apunta cuándo se usó', async () => {
  const { id, clave } = await crearClave('Reparto Rápido');
  const res = await yo({ Authorization: `Bearer ${clave}` });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    tipo: 'clave',
    id,
    nombre: 'Reparto Rápido',
    rol: 'reparto',
  });
  const { rows } = await pool.query('SELECT usada_en FROM claves_api WHERE id = $1', [id]);
  assert.ok(rows[0].usada_en instanceof Date);
});

test('una clave que no existe, o sin el prefijo: 401 con WWW-Authenticate: Bearer', async () => {
  const { clave } = await crearClave('Reparto Rápido');
  for (const falsa of [`${clave.slice(0, -1)}x`, clave.slice(7), 'tienda_inventada']) {
    const res = await yo({ Authorization: `Bearer ${falsa}` });
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('www-authenticate'), 'Bearer realm="tienda-api"');
  }
});

test('con la sesión, /v2/yo dice que es una persona', async () => {
  const sesion = await app.request('/v2/sesion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ana@tienda.example', contrasena: 'ana-practica-2026' }),
  });
  const cookie = sesion.headers.get('set-cookie')!.split(';')[0]!;
  assert.deepEqual(await (await yo({ Cookie: cookie })).json(), {
    tipo: 'usuario',
    id: 1,
    email: 'ana@tienda.example',
    rol: 'admin',
  });
});

test('npm run crear-clave con un rol: catalogo (Fase 11) existe, solo se ve a sí mismo, y un rol que no existe no vale', async () => {
  const { stdout } = await ejecutar('node', [
    'scripts/crear-clave.ts',
    'Comparador de precios',
    'catalogo',
  ]);
  assert.match(stdout, /^Clave \d+, para «Comparador de precios» \(rol catalogo\):$/m);
  const clave = /^(tienda_[\w-]{43})$/m.exec(stdout)![1]!;
  const comoCatalogo = { Authorization: `Bearer ${clave}` };
  // /v2/yo lo dice (y la respuesta cumple el contrato: test/.env pone VALIDAR_RESPUESTAS=fallar).
  const res = await yo(comoCatalogo);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).rol, 'catalogo');
  // Ningún permiso: sabe quién es, y no.
  assert.equal((await app.request('/v2/pedidos', { headers: comoCatalogo })).status, 403);

  // Un rol que no existe, o cliente, que una clave no puede tener: el uso, y ninguna clave nueva.
  for (const rol of ['cliente', 'jefe']) {
    await assert.rejects(ejecutar('node', ['scripts/crear-clave.ts', 'Otra', rol]), (error) => {
      const { code, stderr } = error as { code: number; stderr: string };
      assert.equal(code, 1);
      assert.match(
        stderr,
        /^Uso: npm run crear-clave -- <nombre> \[reparto \| admin \| catalogo\]$/m,
      );
      return true;
    });
  }
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM claves_api WHERE nombre = 'Otra'`,
  );
  assert.equal(rows[0].n, 0);
});
