import type { NextFunction, Request, Response } from "express";
import { newUUIDv7 } from "../../ids.js";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{1,256}$/;
export function requestIdMiddleware(request: Request, response: Response, next: NextFunction): void {
  const incoming = request.headers["x-request-id"];
  const requestId = typeof incoming === "string" && REQUEST_ID_PATTERN.test(incoming) ? incoming : newUUIDv7();
  response.locals["requestId"] = requestId;
  response.setHeader("X-Request-Id", requestId);
  next();
}
