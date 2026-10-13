// #region products
// The shop's products: a list (an array) of objects.
const products = [
  { id: 1, name: 'T-shirt', price: 20 },
  { id: 2, name: 'Mug', price: 8.5 },
  { id: 3, name: 'Hoodie', price: 35 },
];
// #endregion products

// #region total
// A function: it takes a product and a quantity, and returns what they cost.
function total(product, quantity) {
  return product.price * quantity;
}
// #endregion total

// #region filter
// filter keeps the ones that meet a condition; map transforms each one.
const cheap = products.filter((product) => product.price < 25);
const names = cheap.map((product) => product.name);
console.log(`Under 25 €: ${names.join(', ')}`);
// #endregion filter

// #region loop
for (const product of products) {
  console.log(`Two ${product.name}s: ${total(product, 2)} €`);
}
// #endregion loop

// #region json
// JSON: the text that data travels in over HTTP.
const text = JSON.stringify(products[1]);
console.log(text);
const cap = JSON.parse('{"id":4,"name":"Cap","price":15}');
console.log(`From text to object: ${cap.name}, ${cap.price} €`);
// #endregion json
