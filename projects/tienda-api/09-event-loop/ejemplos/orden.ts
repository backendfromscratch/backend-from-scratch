// ¿En qué orden se escriben estas líneas? Ejecútalo con: node ejemplos/orden.ts
console.log('1. Empieza el programa');

setTimeout(() => console.log('4. El temporizador, aunque sea de 0 ms'), 0);

Promise.resolve().then(() => console.log('3. La promesa ya resuelta'));

console.log('2. Termina el código, de arriba abajo');
