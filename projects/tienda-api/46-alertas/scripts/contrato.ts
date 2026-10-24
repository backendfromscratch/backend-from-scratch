// Escribe contrato.json: el contrato de /v2 tal como lo publica la API ahora (Fase 10, lección 3).
// Se sube a Git: un cambio del contrato se ve en el diff de la revisión, y test/contrato.test.ts
// falla mientras contrato.json no coincida. Si el cambio es el que querías: npm run contrato.
import { writeFile } from 'node:fs/promises';
import { documentoContrato } from '../src/contrato-respuestas.ts';

await writeFile('contrato.json', `${JSON.stringify(documentoContrato(), null, 2)}\n`);
console.log('contrato.json escrito');
process.exit(0);
