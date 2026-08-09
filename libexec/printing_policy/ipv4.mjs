// Validates a pinned printer endpoint as an unambiguous private or link-local IPv4 address.
// Public, loopback, multicast, unspecified, and hostname destinations are deliberately excluded.

export function validatePrinterIPv4(value) {
  if (typeof value !== "string") throw new Error("printer IPv4 address must be text");
  const fields = value.split(".");
  if (fields.length !== 4 || fields.some((field) => !/^(?:0|[1-9][0-9]{0,2})$/.test(field))) {
    throw new Error("printer IPv4 address must contain four canonical decimal octets");
  }
  const octets = fields.map(Number);
  if (octets.some((octet) => octet > 255)) {
    throw new Error("printer IPv4 address contains an octet above 255");
  }
  const [a, b] = octets;
  const privateAddress = a === 10
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
  const linkLocalAddress = a === 169 && b === 254;
  if (!privateAddress && !linkLocalAddress) {
    throw new Error("printer IPv4 address must be private or IPv4 link-local");
  }
  if (octets.every((octet) => octet === 255)) {
    throw new Error("printer IPv4 address cannot be a broadcast address");
  }
  return value;
}
