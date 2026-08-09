import { z } from "zod";

export const configSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
    DATABASE_URL: z.string().url(),
    DB_POOL_MIN: z.coerce.number().int().min(0).default(2),
    DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
    REDIS_URL: z.string().url(),
    API_PORT: z.coerce.number().int().min(1024).max(65535).default(3000),
    CORS_ORIGIN: z.string().min(1).transform((value) => value.split(",").map((origin) => origin.trim())),
    JWT_PRIVATE_KEY: z.string().min(1),
    JWT_PUBLIC_KEY: z.string().min(1),
    API_KEY_HMAC_SECRET: z.string().min(32),
    APP_ENCRYPTION_KEY: z.string().min(32),
    ARGON2_MEMORY_COST: z.coerce.number().int().min(8192).default(65536),
    SCHEDULER_TICK_MS: z.coerce.number().int().min(1000).default(5000),
    SCHEDULER_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(10),
    LEASE_DURATION_MS: z.coerce.number().int().min(10000).default(60000),
    RETENTION_PRUNE_INTERVAL_MS: z.coerce.number().int().min(60000).default(86400000),
    RETENTION_PRUNE_BATCH_SIZE: z.coerce.number().int().min(100).max(10000).default(1000),
    WORKER_ROLE: z.enum(["scheduler", "executor"]).default("executor"),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  })
  .refine((value) => value.DB_POOL_MIN <= value.DB_POOL_MAX, {
    message: "DB_POOL_MIN must not exceed DB_POOL_MAX.",
    path: ["DB_POOL_MIN"],
  });

export type Config = z.output<typeof configSchema>;
