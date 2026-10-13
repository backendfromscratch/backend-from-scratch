// In what order are these lines written? Run it with: node examples/order.ts
console.log('1. The program starts');

setTimeout(() => console.log('4. The timer, even though it is 0 ms'), 0);

Promise.resolve().then(() => console.log('3. The promise that is already resolved'));

console.log('2. The code ends, from top to bottom');
