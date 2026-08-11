import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnvironment } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client.js";

loadEnvironment({ path: [".env.local", ".env"], quiet: true });

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

const prismaGlobal = globalThis as typeof globalThis & {
  chronixPrisma?: PrismaClient;
};

const prisma = prismaGlobal.chronixPrisma ?? new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

if (process.env["NODE_ENV"] !== "production") {
  prismaGlobal.chronixPrisma = prisma;
}

export { prisma };
