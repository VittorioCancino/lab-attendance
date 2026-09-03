import { expect, test, type Page } from '@playwright/test';

import {
  e2eAccounts,
  e2eInvitationToken,
  e2eLabId,
} from '@/tests/e2e/fixtures';
import { createE2eRotatingQrToken } from '@/tests/e2e/qr-token';

test.describe.configure({ mode: 'serial' });

async function signInStaff(
  page: Page,
  account: { email: string; password: string },
): Promise<void> {
  await page.goto('/auth/signin');
  await page.getByLabel('Correo electrónico').fill(account.email);
  await page.getByLabel('Contraseña').fill(account.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

test('reports health and applies security headers', async ({ page }) => {
  const [liveness, readiness, attendanceClose, attendance] = await Promise.all([
    page.request.get('/api/health/live'),
    page.request.get('/api/health/ready'),
    page.request.get('/api/health/attendance-close'),
    page.request.get('/attendance'),
  ]);

  expect(liveness.status()).toBe(200);
  expect(await liveness.json()).toEqual({ ok: true, status: 'LIVE' });
  expect(readiness.status()).toBe(200);
  expect(attendanceClose.status()).toBe(200);
  expect(attendance.headers()['cache-control']).toContain('no-store');
  expect(attendance.headers()['content-security-policy']).toContain(
    "object-src 'none'",
  );
  expect(attendance.headers()['strict-transport-security']).toBe(
    'max-age=31536000',
  );
  expect(attendance.headers()['x-content-type-options']).toBe('nosniff');
  expect(attendance.headers()['x-frame-options']).toBe('DENY');
});

test('authenticates global and local administrators through Auth.js', async ({
  browser,
}) => {
  const administratorContext = await browser.newContext();
  const administratorPage = await administratorContext.newPage();

  await signInStaff(administratorPage, e2eAccounts.administrator);
  await expect(administratorPage).toHaveURL(/\/admin$/);
  await expect(
    administratorPage.getByRole('heading', {
      name: 'Gobierno de la instancia',
    }),
  ).toBeVisible();
  await administratorContext.close();

  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();

  await signInStaff(managerPage, e2eAccounts.manager);
  await expect(managerPage).toHaveURL(/\/manager$/);
  await expect(
    managerPage.getByRole('heading', {
      name: 'Control diario del laboratorio',
    }),
  ).toBeVisible();
  await managerContext.close();
});

test('accepts a single-use invitation without exposing the full email', async ({
  page,
}) => {
  await page.goto(`/invite/${e2eInvitationToken}`);

  await expect(
    page.getByRole('heading', { name: 'Active su acceso' }),
  ).toBeVisible();
  await expect(page.getByText(e2eAccounts.invitedAttendee.email)).toHaveCount(
    0,
  );
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill(e2eAccounts.invitedAttendee.password);
  await page
    .getByLabel('Confirmar contraseña')
    .fill(e2eAccounts.invitedAttendee.password);
  await page.getByRole('button', { name: 'Aceptar invitación' }).click();

  await expect(page).toHaveURL(/\/invite\/accepted\?access=attendance$/);
  await expect(
    page.getByRole('heading', { name: 'La invitación fue aceptada' }),
  ).toBeVisible();
});

test('completes the mobile QR check-in and exposes presence to the manager', async ({
  browser,
}) => {
  const qrSecret = process.env.QR_SIGNING_SECRET;

  if (qrSecret === undefined) {
    throw new Error('QR_SIGNING_SECRET is required for the E2E test.');
  }

  const attendeeContext = await browser.newContext({
    viewport: { height: 844, width: 390 },
  });
  const attendeePage = await attendeeContext.newPage();
  const qrToken = createE2eRotatingQrToken(qrSecret, e2eLabId);

  await attendeePage.goto(`/scan#${qrToken}`);
  await expect(attendeePage).toHaveURL(/\/scan\/signin$/);
  await attendeePage
    .getByLabel('Correo electrónico')
    .fill(e2eAccounts.attendee.email);
  await attendeePage
    .getByLabel('Contraseña')
    .fill(e2eAccounts.attendee.password);
  await attendeePage.getByRole('button', { name: 'Continuar' }).click();
  await expect(
    attendeePage.getByRole('heading', { name: 'Confirmar entrada' }),
  ).toBeVisible();
  await attendeePage
    .getByRole('button', { name: 'Registrar mi entrada' })
    .click();
  await expect(
    attendeePage.getByRole('heading', { name: 'Entrada registrada' }),
  ).toBeVisible();
  await attendeeContext.close();

  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();

  await signInStaff(managerPage, e2eAccounts.manager);
  await expect(managerPage).toHaveURL(/\/manager$/);
  await managerPage.goto('/manager/attendance');
  await expect(
    managerPage.getByText(e2eAccounts.attendee.name).first(),
  ).toBeVisible();
  await managerContext.close();
});
