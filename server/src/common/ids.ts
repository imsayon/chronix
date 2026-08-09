import { randomBytes, randomUUID } from "node:crypto";

export function newUUIDv7(): string {
  const bytes = randomBytes(16);
  let timestamp = BigInt(Date.now());
  for (let index = 5; index >= 0; index -= 1) { bytes.set([Number(timestamp & 0xffn)], index); timestamp >>= 8n; }
  bytes.set([(bytes.at(6) ?? 0) & 0x0f | 0x70], 6);
  bytes.set([(bytes.at(8) ?? 0) & 0x3f | 0x80], 8);
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export { randomUUID as newUUIDv4 };
