import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '@/app/generated/prisma/client';

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg(databaseUrl);

  return new PrismaClient({ adapter });
}
