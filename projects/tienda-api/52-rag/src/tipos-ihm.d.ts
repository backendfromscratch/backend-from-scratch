// Los tipos de import-in-the-middle/register-hooks.mjs están en register-hooks.d.ts, y TypeScript
// no los encuentra para un .mjs: esto le dice que el módulo existe, con los tipos de ese fichero.
declare module 'import-in-the-middle/register-hooks.mjs' {
  export * from 'import-in-the-middle/register-hooks.js';
}
