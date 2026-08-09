import { describe, expect, it } from "vitest";
import { BadRequestError } from "./errors/http-errors.js";
import { decodeCursor, encodeCursor } from "./pagination.js";

describe("cursor pagination", () => {
  it("round-trips a stable row identifier", () => {
    expect(decodeCursor(encodeCursor("schedule-1"))).toBe("schedule-1");
  });

  it.each(["", "not-a-cursor", "***", "a".repeat(1_025)])(
    "rejects malformed cursor %j",
    (cursor) => {
      expect(() => decodeCursor(cursor)).toThrow(BadRequestError);
    },
  );
});
