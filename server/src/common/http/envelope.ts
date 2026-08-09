import type { Response } from "express";
import type { AppError } from "../errors/AppError.js";

function requestId(response: Response): string {
  const value: unknown = response.locals["requestId"];
  return typeof value === "string" ? value : "unknown";
}

export function success<T>(response: Response, data: T): { data: T; meta: { requestId: string } } { return { data, meta: { requestId: requestId(response) } }; }
export function error(response: Response, appError: AppError): { error: { code: string; message: string; details?: readonly unknown[] }; meta: { requestId: string } } {
  return { error: { code: appError.code, message: appError.message, ...(appError.details === undefined ? {} : { details: appError.details }) }, meta: { requestId: requestId(response) } };
}
