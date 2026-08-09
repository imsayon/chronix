import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

function packageDirectory(): string {
	return fileURLToPath(new URL("../../..", import.meta.url))
}

export async function migrateToLatest(): Promise<void> {
	const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
	const exitCode = await new Promise<number | null>((resolve, reject) => {
		const child = spawn(command, ["exec", "prisma", "migrate", "deploy"], {
			cwd: packageDirectory(),
			env: process.env,
			stdio: "inherit",
		})
		child.once("error", reject)
		child.once("close", resolve)
	})
	if (exitCode !== 0)
		throw new Error(
			`Prisma migration deployment failed with exit code ${String(exitCode)}.`,
		)
}
