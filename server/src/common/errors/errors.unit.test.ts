import { describe, expect, it } from "vitest";
import { BadRequestError, ConflictError, InternalError, NotFoundError } from "./http-errors.js";

describe("HTTP errors", () => {
  it.each([[new BadRequestError(), 400, "BAD_REQUEST"], [new NotFoundError(), 404, "NOT_FOUND"], [new ConflictError(), 409, "CONFLICT"], [new InternalError(), 500, "INTERNAL_ERROR"]])("exposes stable status and code", (error, status, code) => {
    expect(error.httpStatus).toBe(status);
    expect(error.code).toBe(code);
  });
});
