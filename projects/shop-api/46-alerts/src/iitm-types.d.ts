// The types of import-in-the-middle/register-hooks.mjs are in register-hooks.d.ts, and TypeScript
// doesn't find them for a .mjs: this tells it the module exists, with the types of that file.
declare module 'import-in-the-middle/register-hooks.mjs' {
  export * from 'import-in-the-middle/register-hooks.js';
}
