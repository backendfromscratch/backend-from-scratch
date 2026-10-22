// La configuración de drizzle-kit, la herramienta de Drizzle para el esquema. Aquí solo genera
// migraciones: npm run bd:generar -- --name=lo-que-cambia
// drizzle-kit compara src/esquema.ts con la última foto del esquema que guardó (drizzle/meta/) y
// escribe en drizzle/ el SQL de lo que ha cambiado. No lo aplica: ese fichero se copia a
// bd/migraciones/ con el número siguiente, y lo aplica nuestro ejecutor (npm run bd:migrar), como
// las demás. drizzle/0000_base.sql es la foto de partida: las tablas de las migraciones 001 a 003,
// que ya existían. No se aplica nunca.
// Desde la 005, la migración de bd/migraciones/ se escribe a mano, con comentarios que la explican,
// y dice lo mismo que el SQL que generó drizzle-kit (drizzle/0002_usuarios.sql…). drizzle/ guarda
// esa foto para que la siguiente vez drizzle-kit sepa qué ha cambiado.
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/esquema.ts',
  out: './drizzle',
});
