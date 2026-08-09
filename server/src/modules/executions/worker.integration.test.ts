import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { startTestDatabase } from "../../test/integration-environment.js";
import * as jobsRepository from "../jobs/jobs.repository.js";
import * as schedulesRepository from "../schedules/schedules.repository.js";
import { processExecution } from "./worker.service.js";

let database: PrismaClient;
let stopDatabase: () => Promise<void>;
const workspaceId = randomUUID();
const workerId = "test-worker-1";

beforeAll(async () => {
  const environment = await startTestDatabase();
  database = environment.database;
  stopDatabase = environment.stop;
  await database.workspace.create({
    data: { id: workspaceId, name: "Worker Test", slug: "worker-test" },
  });
});

beforeEach(async () => {
  await database.executionAttempt.deleteMany();
  await database.executionOutbox.deleteMany();
  await database.execution.deleteMany();
  await database.schedule.deleteMany();
  await database.job.deleteMany();
});

afterAll(async () => stopDatabase?.());

async function createExecution(input: {
  suffix: string;
  attemptCount?: number;
  maxRetries: number;
}) {
  const job = await jobsRepository.insertJob(database, {
    workspaceId,
    name: `Job ${input.suffix}`,
    targetUrl: `https://${input.suffix}.example.com/webhook`,
    httpMethod: "POST",
    headers: { Authorization: "Bearer test" },
    bodyTemplate: '{"hello":"world"}',
    timeoutMs: 5_000,
  });
  const schedule = await schedulesRepository.insertSchedule(database, {
    workspaceId,
    jobId: job.id,
    name: `Schedule ${input.suffix}`,
    scheduleType: "one_time",
    timezone: "UTC",
    runAt: new Date(),
    nextRunAt: new Date(),
    maxRetries: input.maxRetries,
    retryBackoffBaseMs: 1_000,
  });
  return database.execution.create({
    data: {
      workspaceId,
      scheduleId: schedule.id,
      jobId: job.id,
      triggerType: "manual",
      nominalRunAt: new Date(),
      idempotencyKey: `test-${input.suffix}`,
      status: "pending",
      attemptCount: input.attemptCount ?? 0,
      maxRetries: input.maxRetries,
      retryBackoffBaseMs: 1_000,
    },
  });
}

describe("worker service integration", () => {
  it("records a successful execution and attempt", async () => {
    const execution = await createExecution({ suffix: "success", maxRetries: 3 });

    await processExecution(database, workerId, execution.id, workspaceId, async () => ({
      outcome: "success",
      statusCode: 200,
      durationMs: 5,
      responseBodySample: "OK",
      errorMessage: null,
    }));

    const [updated, attempts] = await Promise.all([
      database.execution.findUniqueOrThrow({ where: { id: execution.id } }),
      database.executionAttempt.findMany({ where: { executionId: execution.id } }),
    ]);
    expect(updated.status).toBe("succeeded");
    expect(updated.attemptCount).toBe(1);
    expect(updated.terminalAt).not.toBeNull();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe("success");
    expect(attempts[0]?.httpStatusCode).toBe(200);
  });

  it("schedules a retry for a retryable server error", async () => {
    const execution = await createExecution({ suffix: "retry", maxRetries: 2 });

    await processExecution(database, workerId, execution.id, workspaceId, async () => ({
      outcome: "server_error",
      statusCode: 500,
      durationMs: 8,
      responseBodySample: "Internal Server Error",
      errorMessage: null,
    }));

    const [updated, attempts] = await Promise.all([
      database.execution.findUniqueOrThrow({ where: { id: execution.id } }),
      database.executionAttempt.findMany({ where: { executionId: execution.id } }),
    ]);
    expect(updated.status).toBe("pending");
    expect(updated.attemptCount).toBe(1);
    expect(updated.nextRetryAt).not.toBeNull();
    expect(updated.terminalAt).toBeNull();
    expect(attempts[0]?.outcome).toBe("server_error");
  });

  it("fails terminally after retry exhaustion", async () => {
    const execution = await createExecution({
      suffix: "exhausted",
      attemptCount: 1,
      maxRetries: 1,
    });

    await processExecution(database, workerId, execution.id, workspaceId, async () => ({
      outcome: "server_error",
      statusCode: 503,
      durationMs: 8,
      responseBodySample: "Service Unavailable",
      errorMessage: null,
    }));

    const [updated, attempts] = await Promise.all([
      database.execution.findUniqueOrThrow({ where: { id: execution.id } }),
      database.executionAttempt.findMany({ where: { executionId: execution.id } }),
    ]);
    expect(updated.status).toBe("failed");
    expect(updated.attemptCount).toBe(2);
    expect(updated.nextRetryAt).toBeNull();
    expect(updated.terminalAt).not.toBeNull();
    expect(attempts[0]?.attemptNumber).toBe(2);
  });
});
