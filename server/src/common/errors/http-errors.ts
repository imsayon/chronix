import { AppError } from "./AppError.js";

export class BadRequestError extends AppError { public constructor(message = "The request is invalid.", details?: readonly unknown[]) { super("BAD_REQUEST", message, 400, details); } }
export class UnauthorizedError extends AppError { public constructor(message = "Authentication is required.") { super("UNAUTHORIZED", message, 401); } }
export class ForbiddenError extends AppError { public constructor(message = "You are not permitted to perform this action.") { super("FORBIDDEN", message, 403); } }
export class NotFoundError extends AppError { public constructor(message = "The requested resource was not found.") { super("NOT_FOUND", message, 404); } }
export class ConflictError extends AppError { public constructor(message = "The request conflicts with existing state.") { super("CONFLICT", message, 409); } }
export class LastOwnerError extends AppError { public constructor() { super("LAST_OWNER", "A workspace must retain at least one owner.", 409); } }
export class AccountNotFoundError extends AppError { public constructor() { super("ACCOUNT_NOT_FOUND", "The account does not exist.", 404); } }
export class MemberAlreadyExistsError extends AppError { public constructor() { super("MEMBER_ALREADY_EXISTS", "The account is already a workspace member.", 409); } }
export class WorkspaceSlugTakenError extends AppError { public constructor() { super("WORKSPACE_SLUG_TAKEN", "That workspace slug is already in use.", 409); } }
export class VersionConflictError extends AppError { public constructor() { super("VERSION_CONFLICT", "The resource changed; reload and try again.", 409); } }
export class UnprocessableError extends AppError { public constructor(message = "The request cannot be processed.") { super("UNPROCESSABLE", message, 422); } }
export class TooManyRequestsError extends AppError { public constructor(message = "Too many requests. Please slow down.") { super("TOO_MANY_REQUESTS", message, 429); } }
export class ServiceUnavailableError extends AppError { public constructor(message = "The service is temporarily unavailable.") { super("SERVICE_UNAVAILABLE", message, 503); } }
export class InternalError extends AppError { public constructor() { super("INTERNAL_ERROR", "An unexpected error occurred.", 500); } }
export class ValidationError extends BadRequestError { public constructor(details: readonly unknown[]) { super("Request validation failed.", details); this.name = new.target.name; } }
