import { describe, expect, it } from "vitest";
import { BadRequestError } from "./errors/http-errors.js";
import { decodeCursor, encodeCursor } from "./pagination.js";
describe("cursor pagination", () => { it("roundtrips an opaque payload", () => { const payload = { id: "schedule-1", active: true }; expect(decodeCursor(encodeCursor(payload))).toEqual(payload); }); it("rejects malformed cursors", () => { expect(() => decodeCursor("not-a-cursor")).toThrow(BadRequestError); }); });
