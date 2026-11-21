// De dónde carga la tienda el modelo de embeddings (Fase 11, lección 5, src/embeddings.ts): de su
// carpeta, sin preguntar a Hugging Face, cuando ya están todos sus ficheros; por su nombre, que lo
// descarga, cuando falta alguno. Sin el modelo de verdad: aquí los ficheros son de mentira, vacíos,
// porque solo cuenta que estén. Que el de verdad carga y calcula vectores lo prueba
// npm run probar-embeddings, que no es parte de npm test.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import {
  FICHEROS_DEL_MODELO,
  MODELO_EMBEDDINGS,
  origenDelModelo,
  REVISION_EMBEDDINGS,
} from '../src/embeddings.ts';

// Una carpeta de modelos nueva para cada test, con los ficheros que se le digan dentro de la
// carpeta de una versión (por defecto, la nuestra).
const carpetas: string[] = [];
after(() => Promise.all(carpetas.map((carpeta) => rm(carpeta, { recursive: true, force: true }))));

async function carpetaCon(ficheros: string[], revision = REVISION_EMBEDDINGS) {
  const carpeta = await mkdtemp(join(tmpdir(), 'modelos-'));
  carpetas.push(carpeta);
  for (const fichero of ficheros) {
    const ruta = join(carpeta, MODELO_EMBEDDINGS, revision, fichero);
    await mkdir(dirname(ruta), { recursive: true });
    await writeFile(ruta, '');
  }
  return carpeta;
}

test('con la carpeta vacía, por su nombre: lo descarga', async () => {
  const carpeta = await carpetaCon([]);
  assert.equal(origenDelModelo(carpeta), MODELO_EMBEDDINGS);
});

test('con todos los ficheros, de la carpeta de su versión: sin internet', async () => {
  const carpeta = await carpetaCon(FICHEROS_DEL_MODELO);
  assert.equal(origenDelModelo(carpeta), join(carpeta, MODELO_EMBEDDINGS, REVISION_EMBEDDINGS));
});

test('si falta uno, por su nombre: una descarga cortada a medias se termina', async () => {
  for (const falta of FICHEROS_DEL_MODELO) {
    const carpeta = await carpetaCon(FICHEROS_DEL_MODELO.filter((fichero) => fichero !== falta));
    assert.equal(origenDelModelo(carpeta), MODELO_EMBEDDINGS, `sin ${falta}`);
  }
});

test('los ficheros de la versión main no cuentan', async () => {
  // Transformers.js guarda los de main en carpeta/modelo, sin carpeta de la versión.
  const carpeta = await carpetaCon(FICHEROS_DEL_MODELO, '');
  assert.equal(origenDelModelo(carpeta), MODELO_EMBEDDINGS);
});
