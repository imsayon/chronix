import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { createTestConfig, startTestDatabase } from "../../test/integration-environment.js";
import { processDueSchedules } from "./scheduler.service.js";

let database: PrismaClient;
let stopDatabase: () => Promise<void>;

const schedulerConfig = createTestConfig({
  DATABASE_URL: "postgresql://unused",
  REDIS_URL: "redis://unused",
  JWT_PRIVATE_KEY: "unused",
  JWT_PUBLIC_KEY: "unused",
});

beforeAll(async () => {
  const environment = await startTestDatabase();
  database = environment.database;
  stopDatabase = environment.stop;
});

beforeEach(async () => {
  await database.executionOutbox.deleteMany();
  await database.execution.deleteMany();
  await database.schedule.deleteMany();
  await database.job.deleteMany();
  await database.workspace.deleteMany();
});

afterAll(async () => stopDatabase?.());

async function insertWorkspaceAndJob(suffix: string) {
  const workspace = await database.workspace.create({
    data: { id: randomUUID(), name: `Test ${suffix}`, slug: `test-${suffix}` },
  });
  const job = await database.job.create({
    data: {
      id: randomUUID(),
      workspaceId: workspace.id,
      name: `Job ${suffix}`,
      targetUrl: "https://example.com/webhook",
      httpMethod: "POST",
      isEnabled: true,
    },
  });
  return { workspace, job };
}

describe("scheduler integration", () => {
  it("atomically creates an execution and outbox record, then advances a cron schedule", async () => {
    const { workspace, job } = await insertWorkspaceAndJob("cron");
    const now = new Date("2026-07-30T10:00:00.000Z");
    const schedule = await database.schedule.create({
      data: {
        workspaceId: workspace.id,
        jobId: job.id,
        name: "Daily cron",
        scheduleType: "cron",
        cronExpression: "0 10 * * *",
        timezone: "UTC",
        misfirePolicy: "coalesce",
        status: "active",
        nextRunAt: now,
        maxRetries: 3,
        retryBackoffBaseMs: 1_000,
      },
    });

    await expect(
      processDueSchedules(database, schedulerConfig, "scheduler-test", now),
    ).resolves.toBe(1);

    const [updatedSchedule, executions, outbox] = await Promise.all([
      database.schedule.findUniqueOrThrow({ where: { id: schedule.id } }),
      database.execution.findMany({ where: { scheduleId: schedule.id } }),
      database.executionOutbox.findMany(),
    ]);
    expect(updatedSchedule.nextRunAt?.toISOString()).toBe("2026-07-31T10:00:00.000Z");
    expect(executions).toHaveLength(1);
    expect(executions[0]?.status).toBe("pending");
    expect(executions[0]?.nominalRunAt.toISOString()).toBe(now.toISOString());
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.executionId).toBe(executions[0]?.id);
  });

  it("marks a claimed one-time schedule complete", async () => {
    const { workspace, job } = await insertWorkspaceAndJob("one-time");
    const runAt = new Date("2026-07-30T10:00:00.000Z");
    const schedule = await database.schedule.create({
      data: {
        workspaceId: workspace.id,
        jobId: job.id,
        name: "One time",
        scheduleType: "one_time",
        timezone: "UTC",
        misfirePolicy: "coalesce",
        status: "active",
        runAt,
        nextRunAt: runAt,
        maxRetries: 3,
        retryBackoffBaseMs: 1_000,
      },
    });

    await expect(
      processDueSchedules(database, schedulerConfig, "scheduler-test", runAt),
    ).resolves.toBe(1);

    const updated = await database.schedule.findUniqueOrThrow({ where: { id: schedule.id } });
    expect(updated.status).toBe("completed");
    expect(updated.nextRunAt).toBeNull();
  });

  it("allows only one scheduler to claim a due schedule concurrently", async () => {
    const { workspace, job } = await insertWorkspaceAndJob("race");
    const now = new Date("2026-07-30T10:00:00.000Z");
    await database.schedule.create({
      data: {
        workspaceId: workspace.id,
        jobId: job.id,
        name: "Concurrent cron",
        scheduleType: "cron",
        cronExpression: "0 10 * * *",
        timezone: "UTC",
        nextRunAt: now,
        status: "active",
        maxRetries: 3,
        retryBackoffBaseMs: 1_000,
      },
    });

    const results = await Promise.all([
      processDueSchedules(database, schedulerConfig, "scheduler-a", now),
      processDueSchedules(database, schedulerConfig, "scheduler-b", now),
    ]);

    expect(results[0]! + results[1]!).toBe(1);
    expect(await database.execution.count()).toBe(1);
    expect(await database.executionOutbox.count()).toBe(1);
  });

  it("rolls back an execution and outbox together when a transaction fails", async () => {
    const { workspace, job } = await insertWorkspaceAndJob("rollback");
    const schedule = await database.schedule.create({
      data: {
        workspaceId: workspace.id,
        jobId: job.id,
        name: "Rollback schedule",
        scheduleType: "one_time",
        runAt: new Date("2026-07-30T10:00:00.000Z"),
        nextRunAt: new Date("2026-07-30T10:00:00.000Z"),
      },
    });

    await expect(database.$transaction(async (trx) => {
      const execution = await trx.execution.create({
        data: {
          workspaceId: workspace.id,
          scheduleId: schedule.id,
          jobId: job.id,
          nominalRunAt: new Date("2026-07-30T10:00:00.000Z"),
          idempotencyKey: `rollback-${randomUUID()}`,
          maxRetries: 3,
          retryBackoffBaseMs: 1_000,
        },
      });
      await trx.executionOutbox.create({ data: { executionId: execution.id, payload: { executionId: execution.id } } });
      throw new Error("simulated outbox failure");
    })).rejects.toThrow("simulated outbox failure");

    expect(await database.execution.count({ where: { scheduleId: schedule.id } })).toBe(0);
    expect(await database.executionOutbox.count()).toBe(0);
  });
});
