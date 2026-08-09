export class AppError extends Error {
	public constructor(
		public readonly code: string,
		message: string,
		public readonly httpStatus: number,
		public readonly details?: readonly unknown[],
	) {
		super(message)
		this.name = new.target.name
	}
}
