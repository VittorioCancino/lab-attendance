import 'dotenv/config';

import { ZodError } from 'zod';

import { createPrismaClient } from '@/lib/db/client';
import {
  InstanceRegistrationError,
  registerInstance,
} from '@/lib/db/bootstrap-instance';
import { parseInstanceEnvironment } from '@/lib/env';

async function main(): Promise<void> {
  const environment = parseInstanceEnvironment(process.env);
  const prisma = createPrismaClient(environment.DATABASE_URL);

  try {
    const result = await registerInstance(prisma, environment);
    console.info(
      `Lab instance ${environment.LAB_INSTANCE_SLUG} ${result.mode}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

function reportError(error: unknown): void {
  if (error instanceof ZodError) {
    const variables = error.issues
      .map((issue) => issue.path.join('.'))
      .filter((path) => path.length > 0)
      .join(', ');
    console.error(`Invalid instance configuration: ${variables}`);
  } else if (error instanceof InstanceRegistrationError) {
    console.error(error.message);
  } else {
    console.error('Instance registration failed.');
  }

  process.exitCode = 1;
}

void main().catch(reportError);
