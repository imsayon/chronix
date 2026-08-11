import { prisma } from "../lib/prisma.js";

async function main(): Promise<void> {
  await prisma.workspace.findFirst({ select: { id: true } });
  console.log("✅ Connected.");
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
