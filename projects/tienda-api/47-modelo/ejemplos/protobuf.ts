// El mismo pedido, en JSON y en Protobuf: cuántos bytes ocupa cada uno. Ejecútalo con:
// node ejemplos/protobuf.ts
import { join } from 'node:path';
import protobuf from 'protobufjs';

/** Los bytes, en hexadecimal: dos cifras por byte. */
const enHexadecimal = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');

// #region json
const pedido = {
  id: 7,
  productoId: 1,
  cantidad: 2,
  estado: 'pendiente',
  creadoEn: '2026-10-13T09:30:00.000Z',
};

// En JSON viajan los nombres de los campos y los valores, todo como texto.
const comoJson = Buffer.from(JSON.stringify(pedido));
console.log(`JSON: ${comoJson.length} bytes`);
console.log(comoJson.toString());
// #endregion json

// #region protobuf
// El esquema dice qué campos hay, de qué tipo y con qué número. Sin él, los bytes no se pueden leer.
const esquema = await protobuf.load(join(import.meta.dirname, 'pedido.proto'));
const Pedido = esquema.lookupType('tienda.Pedido');

// protobufjs llama a los campos productoId y creadoEn, aunque en el .proto sean producto_id y
// creado_en. El estado va con el nombre del enum.
const mensaje = Pedido.fromObject({ ...pedido, estado: 'PENDIENTE' });
const comoProtobuf = Pedido.encode(mensaje).finish();
console.log(`\nProtobuf: ${comoProtobuf.length} bytes`);
console.log(enHexadecimal(comoProtobuf));

// Y al revés: con el mismo esquema, los bytes vuelven a ser el pedido.
const leido = Pedido.toObject(Pedido.decode(comoProtobuf), { enums: String });
console.log('\nLeído de los bytes:', leido);
// #endregion protobuf
