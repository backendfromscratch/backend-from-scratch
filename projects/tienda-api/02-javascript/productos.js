// #region productos
// Los productos de la tienda: una lista (un array) de objetos.
const productos = [
  { id: 1, nombre: 'Camiseta', precio: 20 },
  { id: 2, nombre: 'Taza', precio: 8.5 },
  { id: 3, nombre: 'Sudadera', precio: 35 },
];
// #endregion productos

// #region total
// Una función: recibe un producto y una cantidad, y devuelve lo que cuestan.
function total(producto, cantidad) {
  return producto.precio * cantidad;
}
// #endregion total

// #region filtrar
// filter se queda con los que cumplen una condición; map transforma cada uno.
const baratos = productos.filter((producto) => producto.precio < 25);
const nombres = baratos.map((producto) => producto.nombre);
console.log(`De menos de 25 €: ${nombres.join(', ')}`);
// #endregion filtrar

// #region bucle
for (const producto of productos) {
  console.log(`Dos de ${producto.nombre}: ${total(producto, 2)} €`);
}
// #endregion bucle

// #region json
// JSON: el texto con el que viajan los datos por HTTP.
const texto = JSON.stringify(productos[1]);
console.log(texto);
const gorra = JSON.parse('{"id":4,"nombre":"Gorra","precio":15}');
console.log(`Del texto al objeto: ${gorra.nombre}, ${gorra.precio} €`);
// #endregion json
