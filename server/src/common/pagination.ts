import { BadRequestError } from "./errors/http-errors.js";

/**
 * Encode a plain string ID as an opaque base64url cursor token.
 */
export function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

/**
 * Decode a cursor token back to a plain string ID.
 */
export function decodeCursor(cursor: string): string {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    if (!decoded) throw new Error("empty");
    return decoded;
  } catch {
    throw new BadRequestError("Invalid pagination cursor.");
  }
}
