import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Queue } from "bullmq";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { createExecutionQueue } from "../../infra/queue/client.js";
import {
  createTestConfig,
  startTestDatabase,
  startTestValkey,
} from "../../test/integration-environment.js";
import { dispatchPending } from "./outbox-dispatcher.service.js";
import { claimExecution, scheduleRetry } from "./executions.repository.js";
import { processExecution } from "./worker.service.js";

let database: PrismaClient;
let queue: Queue;
let stopDatabase: () => Promise<void>;
let stopValkey: () => Promise<void>;

beforeAll(async () => {
  const [databaseEnvironment, valkeyEnvironment] = await Promise.all([
    startTestDatabase(),
    startTestValkey(),
  ]);
  database = databaseEnvironment.database;
  stopDatabase = databaseEnvironment.stop;
  stopValkey = valkeyEnvironment.stop;
  queue = createExecutionQueue(createTestConfig({
    DATABASE_URL: databaseEnvironment.databaseUrl,
    REDIS_URL: valkeyEnvironment.redisUrl,
    JWT_PRIVATE_KEY: "unused",
    JWT_PUBLIC_KEY: "unused",
  }));
});

beforeEach(async () => {
  await queue.obliterate({ force: true });
  await database.executionOutbox.deleteMany();
  await database.execution.deleteMany();
  await database.schedule.deleteMany();
  await database.job.deleteMany();
  await database.workspace.deleteMany();
});

afterAll(async () => {
  await queue?.close();
  await Promise.all([stopDatabase?.(), stopValkey?.()]);
});

async function createPendingExecution(input: {
  attemptCount?: number;
  nextRetryAt?: Date | null;
}) {
  const workspace = await database.workspace.create({
    data: { id: randomUUID(), name: "Dispatch Test", slug: `dispatch-${randomUUID()}` },
  });
  const job = await database.job.create({
    data: {
      workspaceId: workspace.id,
      name: "Dispatch job",
      targetUrl: "https://example.com/webhook",
      httpMethod: "POST",
    },
  });
  const schedule = await database.schedule.create({
    data: {
      workspaceId: workspace.id,
      jobId: job.id,
      name: "Dispatch schedule",
      scheduleType: "one_time",
      runAt: new Date(),
      nextRunAt: new Date(),
    },
  });
  const execution = await database.execution.create({
    data: {
      workspaceId: workspace.id,
      scheduleId: schedule.id,
      jobId: job.id,
      nominalRunAt: new Date(),
      idempotencyKey: `dispatch-${randomUUID()}`,
      maxRetries: 3,
      retryBackoffBaseMs: 1_000,
      attemptCount: input.attemptCount ?? 0,
      nextRetryAt: input.nextRetryAt ?? null,
    },
  });
  await database.executionOutbox.create({
    data: { executionId: execution.id, payload: { executionId: execution.id } },
  });
  return execution;
}

describe("outbox dispatcher integration", () => {
  it("queues a retry only when due", async () => {
    const now = new Date("2026-08-30T10:00:00.000Z");
    const retryAt = new Date(now.getTime() + 1_000);
    const execution = await createPendingExecution({});
    await dispatchPending(database, queue, now);
    await queue.obliterate({ force: true });

    const claimed = await claimExecution(database, execution.id, "retry-worker", 60_000);
    expect(claimed).not.toBeNull();
    await expect(
      scheduleRetry(database, execution.id, claimed!.leaseGeneration, retryAt),
    ).resolves.toBe(true);

    await expect(dispatchPending(database, queue, now)).resolves.toBe(0);
    await expect(queue.getJob(`${execution.id}-1`)).resolves.toBeUndefined();

    await expect(
      dispatchPending(database, queue, retryAt),
    ).resolves.toBe(1);
    const retryJob = await queue.getJob(`${execution.id}-1`);
    expect(retryJob).toBeDefined();

    await processExecution(
      database,
      "retry-worker",
      retryJob!.data.executionId,
      execution.workspaceId,
      async () => ({
        outcome: "success",
        statusCode: 204,
        durationMs: 1,
        responseBodySample: null,
        errorMessage: null,
      }),
    );
    await expect(
      database.execution.findUniqueOrThrow({ where: { id: execution.id } }),
    ).resolves.toMatchObject({ status: "succeeded", attemptCount: 2 });
  });

  it("restores a pending execution after queue data is lost", async () => {
    const now = new Date("2026-08-30T10:00:00.000Z");
    const execution = await createPendingExecution({});
    const queueJobId = `${execution.id}-0`;

    await dispatchPending(database, queue, now);
    await expect(queue.getJob(queueJobId)).resolves.toBeDefined();
    await queue.obliterate({ force: true });
    await expect(queue.getJob(queueJobId)).resolves.toBeUndefined();

    await expect(
      dispatchPending(database, queue, new Date(now.getTime() + 30_000)),
    ).resolves.toBe(1);
    await expect(queue.getJob(queueJobId)).resolves.toBeDefined();
  });

  it("does not duplicate a recently published queue job", async () => {
    const now = new Date("2026-08-30T10:00:00.000Z");
    await createPendingExecution({});

    await expect(dispatchPending(database, queue, now)).resolves.toBe(1);
    await expect(dispatchPending(database, queue, now)).resolves.toBe(0);
    await expect(queue.getWaitingCount()).resolves.toBe(1);
  });
});
