import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { GenericContainer, Wait } from "testcontainers";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import type { Config } from "../common/config/index.js";

const execFileAsync = promisify(execFile);

export async function startTestDatabase(): Promise<{
  database: PrismaClient;
  databaseUrl: string;
  stop(): Promise<void>;
}> {
  const container = await new PostgreSqlContainer("postgres:18-alpine")
    .withDatabase("chronix_test")
    .withUsername("chronix")
    .withPassword("chronix_test")
    .start();
  const databaseUrl = container.getConnectionUri();

  await execFileAsync("./node_modules/.bin/prisma", ["migrate", "deploy"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  await execFileAsync("./node_modules/.bin/prisma", ["migrate", "status"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  const adapter = new PrismaPg({ connectionString: databaseUrl, min: 0, max: 5 });
  const database = new PrismaClient({ adapter });
  await database.$connect();

  return {
    database,
    databaseUrl,
    stop: async () => {
      await database.$disconnect();
      await container.stop();
    },
  };
}

export async function startTestValkey(): Promise<{
  redisUrl: string;
  stop(): Promise<void>;
}> {
  const container = await new GenericContainer("valkey/valkey:8-alpine")
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  return {
    redisUrl: `redis://${container.getHost()}:${String(container.getMappedPort(6379))}`,
    stop: () => container.stop().then(() => undefined),
  };
}

export function createTestConfig(
  overrides: Partial<Config> & Pick<Config, "DATABASE_URL" | "REDIS_URL" | "JWT_PRIVATE_KEY" | "JWT_PUBLIC_KEY">,
): Config {
  return {
    NODE_ENV: "test",
    LOG_LEVEL: "error",
    DB_POOL_MIN: 0,
    DB_POOL_MAX: 5,
    API_PORT: 3000,
    CORS_ORIGIN: ["http://localhost:3001"],
    API_KEY_HMAC_SECRET: "test-hmac-secret-that-is-at-least-32-characters",
    ARGON2_MEMORY_COST: 8_192,
    SCHEDULER_TICK_MS: 1_000,
    SCHEDULER_BATCH_SIZE: 50,
    WORKER_CONCURRENCY: 2,
    LEASE_DURATION_MS: 60_000,
    WORKER_ROLE: "executor",
    ...overrides,
  };
}
