// Por qué el dinero no se guarda con decimales. Ejecútalo con: node ejemplos/dinero.ts

// #region decimales
// Los números con decimales se guardan en binario, y 0,1 no tiene una forma exacta en binario
// (como 1/3 no la tiene en decimal: 0,3333…). Se guarda el más cercano, y los errores se suman.
console.log('0.1 + 0.2 =', 0.1 + 0.2);
console.log('¿0.1 + 0.2 es 0.3?', 0.1 + 0.2 === 0.3);

// Una taza de 8,50 €, una pegatina de 0,10 € y una chapa de 0,20 €.
const totalEnEuros = 8.5 + 0.1 + 0.2;
console.log('\nEn euros:', totalEnEuros);
// #endregion decimales

// #region centimos
// En céntimos, todo son números enteros: las sumas son exactas.
const totalEnCentimos = 850 + 10 + 20;
console.log('En céntimos:', totalEnCentimos);

// Solo al enseñarlo se pasa a euros, con el formato de cada idioma.
const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
console.log('Para enseñarlo:', euros.format(totalEnCentimos / 100));
// #endregion centimos
