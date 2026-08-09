import type { NextFunction, Request, Response } from "express";
import { logger } from "../../../infra/telemetry.js";
import { AppError } from "../../errors/AppError.js";
import { InternalError, NotFoundError } from "../../errors/http-errors.js";
import { error } from "../envelope.js";

export function notFoundHandler(_request: Request, response: Response): void {
  const appError = new NotFoundError("Route not found.");
  response.status(appError.httpStatus).json(error(response, appError));
}

// Express requires a 4-argument signature to identify the function as an error handler.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function globalErrorHandler(exception: unknown, _request: Request, response: Response, _next: NextFunction): void {
  if (exception instanceof AppError) {
    logger.warn({ code: exception.code, requestId: response.locals["requestId"] }, exception.message);
    response.status(exception.httpStatus).json(error(response, exception));
    return;
  }
  logger.error({ err: exception, requestId: response.locals["requestId"] }, "Unhandled error");
  const appError = new InternalError();
  response.status(appError.httpStatus).json(error(response, appError));
}
