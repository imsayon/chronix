import { prisma } from "../lib/prisma.js";

async function main(): Promise<void> {
  const workspace = await prisma.workspace.upsert({
    where: { slug: "chronix-demo" },
    update: {},
    create: {
      name: "Chronix Demo",
      slug: "chronix-demo",
      retentionDays: 30,
    },
  });

  const job = await prisma.job.upsert({
    where: {
      workspaceId_name: {
        workspaceId: workspace.id,
        name: "Example webhook",
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      name: "Example webhook",
      description: "Seeded delivery target for inspecting the hosted database.",
      targetUrl: "https://example.com/webhook",
      httpMethod: "POST",
      headers: {},
      timeoutMs: 10_000,
    },
  });

  await prisma.schedule.upsert({
    where: {
      workspaceId_name: {
        workspaceId: workspace.id,
        name: "Paused daily example",
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      jobId: job.id,
      name: "Paused daily example",
      description: "A safe, paused seed schedule that never delivers automatically.",
      scheduleType: "cron",
      cronExpression: "0 9 * * *",
      timezone: "UTC",
      status: "paused",
      misfirePolicy: "coalesce",
      nextRunAt: null,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
