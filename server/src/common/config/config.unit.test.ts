import { describe, expect, it } from "vitest";
import { configSchema } from "./schema.js";

const validEnvironment = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://chronix:password@localhost:5432/chronix_test",
  REDIS_URL: "redis://localhost:6379",
  CORS_ORIGIN: "http://localhost:3001",
  JWT_PRIVATE_KEY: "test-private-key",
  JWT_PUBLIC_KEY: "test-public-key",
  API_KEY_HMAC_SECRET: "test-hmac-secret-that-is-at-least-32-characters",
  APP_ENCRYPTION_KEY: "chronix-test-encryption-key-32b!",
};

describe("configSchema", () => {
  it("applies safe defaults", () => {
    const result = configSchema.safeParse(validEnvironment);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toMatchObject({ API_PORT: 3000, DB_POOL_MIN: 2, DB_POOL_MAX: 10, WORKER_ROLE: "executor" });
  });

  it("rejects a missing database URL", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { DATABASE_URL: _databaseUrl, ...withoutDatabaseUrl } = validEnvironment;
    expect(configSchema.safeParse(withoutDatabaseUrl).success).toBe(false);
  });

  it("rejects an invalid pool range", () => {
    expect(configSchema.safeParse({ ...validEnvironment, DB_POOL_MIN: "11", DB_POOL_MAX: "10" }).success).toBe(false);
  });
});
