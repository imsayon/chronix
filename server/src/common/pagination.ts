import { BadRequestError } from "./errors/http-errors.js";

const MAX_CURSOR_LENGTH = 1_024;
const CURSOR_VERSION = 1;

type CursorPayload = Readonly<{
  v: typeof CURSOR_VERSION;
  id: string;
}>;

/** Encode the stable row identifier as an opaque, versioned cursor. */
export function encodeCursor(id: string): string {
  if (id.length === 0) throw new Error("Cannot encode an empty cursor identifier.");
  const payload: CursorPayload = { v: CURSOR_VERSION, id };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

/** Decode and validate an opaque cursor supplied by an untrusted client. */
export function decodeCursor(cursor: string): string {
  try {
    if (cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
      throw new Error("invalid encoding");
    }

    const decoded: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      !("v" in decoded) ||
      decoded.v !== CURSOR_VERSION ||
      !("id" in decoded) ||
      typeof decoded.id !== "string" ||
      decoded.id.length === 0
    ) {
      throw new Error("invalid payload");
    }
    return decoded.id;
  } catch {
    throw new BadRequestError("Invalid pagination cursor.");
  }
}
