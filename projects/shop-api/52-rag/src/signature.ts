// The webhooks' signature: that's how the shop knows the notification comes from the payment
// gateway and nobody changed it on the way. The server and the fake gateway (scripts/) use it.
import { createHmac, timingSafeEqual } from 'node:crypto';

// #region sign
// An HMAC-SHA256 of the body, exactly as it arrives, with a secret only the gateway and the shop
// know. Without the secret it can't be calculated; if a single byte of the body changes, it all
// changes.
export function sign(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}
// #endregion sign

// #region check
// It calculates the signature the request should carry and compares it with the one it carries.
// timingSafeEqual takes the same time whether it matches or not: with ===, someone timing it could
// guess it letter by letter.
export function validSignature(
  body: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (signature === undefined) return false;
  const expected = Buffer.from(sign(body, secret));
  const received = Buffer.from(signature);
  // timingSafeEqual only compares two things of the same size.
  return expected.length === received.length && timingSafeEqual(expected, received);
}
// #endregion check
