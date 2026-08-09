import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../../generated/prisma/client.js"
import type { Config } from "../../common/config/index.js"

export function createDatabaseClient(config: Config): PrismaClient {
	const adapter = new PrismaPg({
		connectionString: config.DATABASE_URL,
		min: config.DB_POOL_MIN,
		max: config.DB_POOL_MAX,
	})
	return new PrismaClient({ adapter })
}
