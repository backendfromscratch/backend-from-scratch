// The same order, in JSON and in Protobuf: how many bytes each one takes. Run it with:
// node examples/protobuf.ts
import { join } from 'node:path';
import protobuf from 'protobufjs';

/** The bytes, in hexadecimal: two digits per byte. */
const asHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');

// #region json
const order = {
  id: 7,
  productId: 1,
  quantity: 2,
  status: 'pending',
  createdAt: '2026-10-13T09:30:00.000Z',
};

// In JSON, the field names and the values travel, all as text.
const asJson = Buffer.from(JSON.stringify(order));
console.log(`JSON: ${asJson.length} bytes`);
console.log(asJson.toString());
// #endregion json

// #region protobuf
// The schema says which fields there are, of what type and with what number. Without it, the
// bytes can't be read.
const schema = await protobuf.load(join(import.meta.dirname, 'order.proto'));
const Order = schema.lookupType('shop.Order');

// protobufjs calls the fields productId and createdAt, even though in the .proto they're
// product_id and created_at. The status goes with the enum's name.
const message = Order.fromObject({ ...order, status: 'PENDING' });
const asProtobuf = Order.encode(message).finish();
console.log(`\nProtobuf: ${asProtobuf.length} bytes`);
console.log(asHex(asProtobuf));

// And the other way round: with the same schema, the bytes become the order again.
const decoded = Order.toObject(Order.decode(asProtobuf), { enums: String });
console.log('\nRead from the bytes:', decoded);
// #endregion protobuf
