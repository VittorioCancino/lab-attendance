import { describe, expect, it } from 'vitest';

import {
  parseAttendanceCronSecret,
  parseInstanceEnvironment,
  parseServerEnvironment,
} from '@/lib/env';

const validEnvironment = {
  AUTH_SECRET: 'test-auth-secret-with-at-least-32-characters',
  AUTH_TRUST_HOST: 'true',
  DATABASE_URL:
    'postgresql://lab_attendance:lab_attendance_dev@localhost:5432/lab_attendance',
  LAB_INSTANCE_PUBLIC_URL: 'https://lab.example.test',
  LAB_INSTANCE_SLUG: 'main-lab',
  QR_SIGNING_SECRET: 'test-qr-secret-with-at-least-32-characters',
};

describe('parseServerEnvironment', () => {
  it('accepts the required server configuration', () => {
    expect(parseServerEnvironment(validEnvironment)).toEqual(validEnvironment);
  });

  it('rejects a missing lab instance slug', () => {
    expect(() =>
      parseServerEnvironment({
        DATABASE_URL: validEnvironment.DATABASE_URL,
      }),
    ).toThrow();
  });

  it('rejects a lab instance slug that is not normalized', () => {
    expect(() =>
      parseServerEnvironment({
        ...validEnvironment,
        LAB_INSTANCE_SLUG: 'Main Lab',
      }),
    ).toThrow();
  });

  it('normalizes the public URL and rejects paths', () => {
    expect(
      parseServerEnvironment({
        ...validEnvironment,
        LAB_INSTANCE_PUBLIC_URL: 'https://lab.example.test/',
      }).LAB_INSTANCE_PUBLIC_URL,
    ).toBe('https://lab.example.test');
    expect(() =>
      parseServerEnvironment({
        ...validEnvironment,
        LAB_INSTANCE_PUBLIC_URL: 'https://lab.example.test/display',
      }),
    ).toThrow();
    expect(() =>
      parseServerEnvironment({
        ...validEnvironment,
        LAB_INSTANCE_PUBLIC_URL: 'ftp://lab.example.test',
      }),
    ).toThrow();
  });

  it('requires independent authentication and QR-signing secrets', () => {
    expect(() =>
      parseServerEnvironment({
        ...validEnvironment,
        QR_SIGNING_SECRET: validEnvironment.AUTH_SECRET,
      }),
    ).toThrow();
  });
});

describe('parseAttendanceCronSecret', () => {
  it('requires a strong secret distinct from application signing keys', () => {
    const cronSecret = 'test-cron-secret-with-at-least-32-characters';

    expect(
      parseAttendanceCronSecret({
        ...validEnvironment,
        ATTENDANCE_CRON_SECRET: cronSecret,
      }),
    ).toBe(cronSecret);
    expect(
      parseAttendanceCronSecret({
        ...validEnvironment,
        ATTENDANCE_CRON_SECRET: validEnvironment.AUTH_SECRET,
      }),
    ).toBeNull();
    expect(
      parseAttendanceCronSecret({
        ...validEnvironment,
        ATTENDANCE_CRON_SECRET: validEnvironment.QR_SIGNING_SECRET,
      }),
    ).toBeNull();
  });
});

describe('parseInstanceEnvironment', () => {
  it('defaults to read-only instance validation', () => {
    expect(parseInstanceEnvironment(validEnvironment)).toEqual({
      ...validEnvironment,
      bootstrapEnabled: false,
    });
  });

  it('validates and normalizes enabled bootstrap configuration', () => {
    expect(
      parseInstanceEnvironment({
        ...validEnvironment,
        INSTANCE_BOOTSTRAP_ENABLED: 'true',
        LAB_INSTANCE_NAME: 'Laboratorio principal',
        LAB_INSTANCE_TIMEZONE: 'America/Santiago',
        LAB_BOOTSTRAP_ADMIN_NAME: 'Administrador general',
        LAB_BOOTSTRAP_ADMIN_EMAIL: ' ADMIN@LAB.LOCAL ',
        LAB_BOOTSTRAP_ADMIN_INITIAL_PASSWORD: 'local-password',
      }),
    ).toEqual({
      ...validEnvironment,
      bootstrapEnabled: true,
      labName: 'Laboratorio principal',
      labTimezone: 'America/Santiago',
      adminName: 'Administrador general',
      adminEmail: 'admin@lab.local',
      adminInitialPassword: 'local-password',
    });
  });

  it('rejects incomplete enabled bootstrap configuration', () => {
    expect(() =>
      parseInstanceEnvironment({
        ...validEnvironment,
        INSTANCE_BOOTSTRAP_ENABLED: 'true',
      }),
    ).toThrow();
  });

  it('rejects an invalid lab timezone', () => {
    expect(() =>
      parseInstanceEnvironment({
        ...validEnvironment,
        INSTANCE_BOOTSTRAP_ENABLED: 'true',
        LAB_INSTANCE_NAME: 'Laboratorio principal',
        LAB_INSTANCE_TIMEZONE: 'Not/A_Timezone',
        LAB_BOOTSTRAP_ADMIN_NAME: 'Administrador general',
        LAB_BOOTSTRAP_ADMIN_EMAIL: 'admin@lab.local',
      }),
    ).toThrow();
  });
});
