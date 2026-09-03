import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { parseServerEnvironment } from '@/lib/env';

export interface CurrentLab {
  id: string;
  name: string;
  slug: string;
  timezone: string;
}

export async function getCurrentLab(): Promise<CurrentLab> {
  const environment = parseServerEnvironment(process.env);
  const lab = await prisma.lab.findUnique({
    where: { slug: environment.LAB_INSTANCE_SLUG },
    select: {
      id: true,
      isActive: true,
      name: true,
      slug: true,
      timezone: true,
    },
  });

  if (!lab?.isActive) {
    throw new Error('The configured lab is not available.');
  }

  return {
    id: lab.id,
    name: lab.name,
    slug: lab.slug,
    timezone: lab.timezone,
  };
}
