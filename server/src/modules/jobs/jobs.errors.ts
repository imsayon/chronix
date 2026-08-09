import { AppError } from '../../common/errors/AppError.js'

export class JobNotFoundError extends AppError {
	constructor(jobId: string) {
		super('JOB_NOT_FOUND', `Job ${jobId} not found.`, 404)
	}
}

export class JobHasActiveSchedulesError extends AppError {
	constructor(jobId: string) {
		super('JOB_HAS_ACTIVE_SCHEDULES', `Job ${jobId} cannot be deleted because it has active schedules.`, 409)
	}
}

export class JobNameTakenError extends AppError {
	constructor(name: string) {
		super('JOB_NAME_TAKEN', `A job with the name '${name}' already exists in this workspace.`, 409)
	}
}
