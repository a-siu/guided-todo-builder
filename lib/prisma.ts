import { PrismaClient } from "@prisma/client";
import { v7 as uuidv7 } from "uuidv7";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

prisma.$use(async (params, next) => {
  if (params.action === "create" && !params.args.data.id) {
    params.args.data.id = uuidv7();
  }
  return next(params);
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
