import type { Request } from "express";
import type { ZodType } from "zod";
import { ValidationError } from "./errors/http-errors.js";
function validate<T>(schema: ZodType<T>, value: unknown): T { const result = schema.safeParse(value); if (result.success) return result.data; throw new ValidationError(result.error.issues.map((issue) => ({ code: issue.code, message: issue.message, path: issue.path }))); }
export function parseBody<T>(schema: ZodType<T>, body: unknown): T { return validate(schema, body); }
export function parseQuery<T>(schema: ZodType<T>, request: Request): T { return validate(schema, request.query); }
export function parseParams<T>(schema: ZodType<T>, request: Request): T { return validate(schema, request.params); }
