import { z } from 'zod';

const publicUrlSchema = z
  .url()
  .transform((value) => new URL(value))
  .refine(
    (url) =>
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === '',
    { message: 'Public URL must be an HTTP(S) origin.' },
  )
  .transform((url) => url.origin);

const serverEnvironmentSchema = z.object({
  AUTH_SECRET: z.string().min(32),
  AUTH_TRUST_HOST: z.literal('true'),
  DATABASE_URL: z.url(),
  LAB_INSTANCE_PUBLIC_URL: publicUrlSchema,
  LAB_INSTANCE_SLUG: z
    .string()
    .trim()
    .min(1)
    .max(63)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  QR_SIGNING_SECRET: z.string().min(32),
});

const attendanceCronSecretSchema = z.string().min(32).max(512);

const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(
    (timezone) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid IANA timezone.' },
  );

const enabledBootstrapEnvironmentSchema = serverEnvironmentSchema.extend({
  INSTANCE_BOOTSTRAP_ENABLED: z.literal('true'),
  LAB_INSTANCE_NAME: z.string().trim().min(1).max(160),
  LAB_INSTANCE_TIMEZONE: timezoneSchema,
  LAB_BOOTSTRAP_ADMIN_NAME: z.string().trim().min(1).max(160),
  LAB_BOOTSTRAP_ADMIN_EMAIL: z
    .string()
    .trim()
    .pipe(z.email())
    .transform((email) => email.toLowerCase()),
  LAB_BOOTSTRAP_ADMIN_INITIAL_PASSWORD: z.string().min(12).max(1024).optional(),
});

const disabledBootstrapEnvironmentSchema = serverEnvironmentSchema.extend({
  INSTANCE_BOOTSTRAP_ENABLED: z.literal('false'),
});

const instanceEnvironmentSchema = z.discriminatedUnion(
  'INSTANCE_BOOTSTRAP_ENABLED',
  [enabledBootstrapEnvironmentSchema, disabledBootstrapEnvironmentSchema],
);

export interface ServerEnvironment {
  AUTH_SECRET: string;
  AUTH_TRUST_HOST: 'true';
  DATABASE_URL: string;
  LAB_INSTANCE_PUBLIC_URL: string;
  LAB_INSTANCE_SLUG: string;
  QR_SIGNING_SECRET: string;
}

export interface DisabledInstanceEnvironment extends ServerEnvironment {
  bootstrapEnabled: false;
}

export interface EnabledInstanceEnvironment extends ServerEnvironment {
  bootstrapEnabled: true;
  labName: string;
  labTimezone: string;
  adminName: string;
  adminEmail: string;
  adminInitialPassword?: string;
}

export type InstanceEnvironment =
  DisabledInstanceEnvironment | EnabledInstanceEnvironment;

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

function requireDistinctApplicationSecrets(environment: ServerEnvironment) {
  if (environment.AUTH_SECRET === environment.QR_SIGNING_SECRET) {
    throw new Error('Authentication and QR signing secrets must be distinct.');
  }
}

export function parseServerEnvironment(
  environment: EnvironmentSource,
): ServerEnvironment {
  const parsed = serverEnvironmentSchema.parse(environment);

  requireDistinctApplicationSecrets(parsed);

  return parsed;
}

export function parseAttendanceCronSecret(
  environment: EnvironmentSource,
): string | null {
  const parsed = attendanceCronSecretSchema.safeParse(
    environment.ATTENDANCE_CRON_SECRET,
  );

  if (
    !parsed.success ||
    parsed.data === environment.AUTH_SECRET ||
    parsed.data === environment.QR_SIGNING_SECRET
  ) {
    return null;
  }

  return parsed.data;
}

export function parseInstanceEnvironment(
  environment: EnvironmentSource,
): InstanceEnvironment {
  const parsed = instanceEnvironmentSchema.parse({
    ...environment,
    INSTANCE_BOOTSTRAP_ENABLED:
      environment.INSTANCE_BOOTSTRAP_ENABLED ?? 'false',
  });

  requireDistinctApplicationSecrets(parsed);

  if (parsed.INSTANCE_BOOTSTRAP_ENABLED === 'false') {
    return {
      AUTH_SECRET: parsed.AUTH_SECRET,
      AUTH_TRUST_HOST: parsed.AUTH_TRUST_HOST,
      DATABASE_URL: parsed.DATABASE_URL,
      LAB_INSTANCE_PUBLIC_URL: parsed.LAB_INSTANCE_PUBLIC_URL,
      LAB_INSTANCE_SLUG: parsed.LAB_INSTANCE_SLUG,
      QR_SIGNING_SECRET: parsed.QR_SIGNING_SECRET,
      bootstrapEnabled: false,
    };
  }

  return {
    AUTH_SECRET: parsed.AUTH_SECRET,
    AUTH_TRUST_HOST: parsed.AUTH_TRUST_HOST,
    DATABASE_URL: parsed.DATABASE_URL,
    LAB_INSTANCE_PUBLIC_URL: parsed.LAB_INSTANCE_PUBLIC_URL,
    LAB_INSTANCE_SLUG: parsed.LAB_INSTANCE_SLUG,
    QR_SIGNING_SECRET: parsed.QR_SIGNING_SECRET,
    bootstrapEnabled: true,
    labName: parsed.LAB_INSTANCE_NAME,
    labTimezone: parsed.LAB_INSTANCE_TIMEZONE,
    adminName: parsed.LAB_BOOTSTRAP_ADMIN_NAME,
    adminEmail: parsed.LAB_BOOTSTRAP_ADMIN_EMAIL,
    ...(parsed.LAB_BOOTSTRAP_ADMIN_INITIAL_PASSWORD === undefined
      ? {}
      : {
          adminInitialPassword: parsed.LAB_BOOTSTRAP_ADMIN_INITIAL_PASSWORD,
        }),
  };
}
