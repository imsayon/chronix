import { AppError } from '../../common/errors/AppError.js'

export class ScheduleNotFoundError extends AppError {
	constructor(id: string) {
		super('SCHEDULE_NOT_FOUND', `Schedule ${id} not found.`, 404)
	}
}

export class ScheduleAlreadyPausedError extends AppError {
	constructor() {
		super('SCHEDULE_ALREADY_PAUSED', 'Schedule is already paused.', 409)
	}
}

export class ScheduleNotPausedError extends AppError {
	constructor() {
		super('SCHEDULE_NOT_PAUSED', 'Schedule is not paused.', 409)
	}
}

export class ScheduleTerminalError extends AppError {
	constructor() {
		super('SCHEDULE_TERMINAL', 'Cannot modify a terminal schedule.', 409)
	}
}

export class ScheduleNameTakenError extends AppError {
	constructor(name: string) {
		super('SCHEDULE_NAME_TAKEN', `Schedule name '${name}' is already taken.`, 409)
	}
}

export class JobDisabledError extends AppError {
	constructor(jobId: string) {
		super('JOB_DISABLED', `Job ${jobId} is disabled.`, 422)
	}
}

export class InvalidCronExpressionError extends AppError {
	constructor(expr: string) {
		super('INVALID_CRON_EXPRESSION', `Invalid cron expression: ${expr}`, 422)
	}
}

export class InvalidTimezoneError extends AppError {
	constructor(tz: string) {
		super('INVALID_TIMEZONE', `Invalid timezone: ${tz}`, 422)
	}
}
export class InvalidCronError extends AppError {
	public constructor() { super('INVALID_CRON', 'The cron expression is invalid.', 400) }
}
export class ScheduleInvariantError extends AppError {
	public constructor(message = 'The schedule fields are inconsistent.') { super('SCHEDULE_INVARIANT', message, 400) }
}

export class OneTimeInPastError extends AppError {
	constructor() {
		super('ONE_TIME_IN_PAST', 'One-time schedule run_at must be in the future.', 422)
	}
}

export class OneTimeAlreadyFiredError extends AppError {
	constructor() {
		super('ONE_TIME_ALREADY_FIRED', 'One-time schedule has already fired.', 409)
	}
}
