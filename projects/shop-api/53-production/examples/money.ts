// Why money isn't stored with decimals. Run it with: node examples/money.ts

// #region decimals
// Numbers with decimals are stored in binary, and 0.1 has no exact form in binary (just as 1/3
// has none in decimal: 0.3333…). The closest one is stored, and the errors add up.
console.log('0.1 + 0.2 =', 0.1 + 0.2);
console.log('Is 0.1 + 0.2 equal to 0.3?', 0.1 + 0.2 === 0.3);

// A €8.50 mug, a €0.10 sticker and a €0.20 badge.
const totalInEuros = 8.5 + 0.1 + 0.2;
console.log('\nIn euros:', totalInEuros);
// #endregion decimals

// #region cents
// In cents, everything is a whole number: the sums are exact.
const totalInCents = 850 + 10 + 20;
console.log('In cents:', totalInCents);

// Only when it's shown is it turned into euros, with each language's format.
const euros = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' });
console.log('To show it:', euros.format(totalInCents / 100));
// #endregion cents
