import { AppError } from "./errors/AppError.js"

export class InvalidCredentialsError extends AppError {
	public constructor() {
		super("INVALID_CREDENTIALS", "Invalid email or password.", 401)
	}
}

export class EmailAlreadyRegisteredError extends AppError {
	public constructor() {
		super(
			"EMAIL_ALREADY_REGISTERED",
			"An account with this email address already exists.",
			409,
		)
	}
}

export class SessionExpiredError extends AppError {
	public constructor() {
		super(
			"SESSION_EXPIRED",
			"Your session has expired. Please log in again.",
			401,
		)
	}
}

export class RefreshTokenReuseError extends AppError {
	public constructor() {
		super(
			"REFRESH_TOKEN_REUSE",
			"A security event was detected. All sessions have been invalidated.",
			401,
		)
	}
}

export class InactiveAccountError extends AppError {
	public constructor() {
		super(
			"ACCOUNT_INACTIVE",
			"This account has been disabled. Contact support.",
			403,
		)
	}
}

export class ApiKeyAuthError extends AppError {
	public constructor() {
		super(
			"API_KEY_INVALID",
			"The provided API key is invalid, expired, or has been revoked.",
			401,
		)
	}
}
