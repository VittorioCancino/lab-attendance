import 'server-only';

import { createPrismaClient } from '@/lib/db/client';
import { parseServerEnvironment } from '@/lib/env';

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

const environment = parseServerEnvironment(process.env);

export const prisma =
  globalForPrisma.prisma ?? createPrismaClient(environment.DATABASE_URL);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
