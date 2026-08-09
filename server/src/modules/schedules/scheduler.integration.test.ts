import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PrismaClient } from "../../generated/prisma/client.js";
import { processDueSchedules } from "./scheduler.service.js";
import * as outboxRepo from "../executions/outbox.repository.js";
import * as scheduleRepo from "./schedules.repository.js";
import { v4 as uuidv4 } from "uuid";

// We use an in-memory testing strategy or a dedicated test DB depending on the setup.
// Assuming we have a real PrismaClient pointing to a test database or similar.
const db = new PrismaClient();

describe("Scheduler Integration", () => {
  beforeEach(async () => {
    // Clear outbox, executions, schedules, jobs, workspaces for clean slate
    await db.outbox.deleteMany();
    await db.execution.deleteMany();
    await db.schedule.deleteMany();
    await db.job.deleteMany();
    await db.workspace.deleteMany();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("processes a due cron schedule and advances nextRunAt", async () => {
    const workspaceId = uuidv4();
    await db.workspace.create({ data: { id: workspaceId, name: "Test WS", slug: "test-ws" } });

    const jobId = uuidv4();
    await db.job.create({
      data: {
        id: jobId,
        workspaceId,
        name: "Test Job",
        targetUrl: "https://test.com",
        httpMethod: "POST",
        enabled: true
      }
    });

    const now = new Date("2026-07-30T10:00:00Z");
    const nextRunAt = new Date("2026-07-30T10:00:00Z");

    const schedule = await db.schedule.create({
      data: {
        workspaceId,
        jobId,
        name: "Test Cron",
        scheduleType: "cron",
        cronExpression: "0 10 * * *", // 10 AM every day
        timezone: "UTC",
        misfirePolicy: "coalesce",
        status: "active",
        nextRunAt,
        maxRetries: 3,
        retryBackoffBaseMs: 1000
      }
    });

    const config = { SCHEDULER_TICK_MS: 1000 } as any;

    const claimed = await processDueSchedules(db, config, "test-scheduler", now);

    expect(claimed).toBe(1);

    // Verify schedule advanced
    const updatedSchedule = await db.schedule.findUnique({ where: { id: schedule.id } });
    expect(updatedSchedule?.nextRunAt?.toISOString()).toBe("2026-07-31T10:00:00.000Z");

    // Verify execution created
    const executions = await db.execution.findMany({ where: { scheduleId: schedule.id } });
    expect(executions.length).toBe(1);
    expect(executions[0].status).toBe("pending");
    expect(executions[0].nominalRunAt.toISOString()).toBe("2026-07-30T10:00:00.000Z");

    // Verify outbox created
    const outbox = await db.outbox.findMany();
    expect(outbox.length).toBe(1);
    expect(outbox[0].executionId).toBe(executions[0].id);
  });

  it("processes a due one_time schedule and completes it", async () => {
    const workspaceId = uuidv4();
    await db.workspace.create({ data: { id: workspaceId, name: "Test WS 2", slug: "test-ws-2" } });

    const jobId = uuidv4();
    await db.job.create({
      data: {
        id: jobId,
        workspaceId,
        name: "Test Job",
        targetUrl: "https://test.com",
        httpMethod: "POST",
        enabled: true
      }
    });

    const runAt = new Date("2026-07-30T10:00:00Z");

    const schedule = await db.schedule.create({
      data: {
        workspaceId,
        jobId,
        name: "Test One Time",
        scheduleType: "one_time",
        misfirePolicy: "coalesce",
        status: "active",
        runAt,
        nextRunAt: runAt,
        maxRetries: 3,
        retryBackoffBaseMs: 1000
      }
    });

    const config = { SCHEDULER_TICK_MS: 1000 } as any;

    const claimed = await processDueSchedules(db, config, "test-scheduler", runAt);

    expect(claimed).toBe(1);

    const updatedSchedule = await db.schedule.findUnique({ where: { id: schedule.id } });
    expect(updatedSchedule?.status).toBe("completed");
    expect(updatedSchedule?.nextRunAt).toBeNull();
  });
});
