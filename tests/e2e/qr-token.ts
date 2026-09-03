import { createHmac } from 'node:crypto';

export function createE2eRotatingQrToken(
  secret: string,
  labId: string,
  now = new Date(),
): string {
  const window = Math.floor(now.getTime() / 60_000);
  const payload = Buffer.from(
    JSON.stringify({
      labId,
      purpose: 'attendance',
      version: 1,
      window,
    }),
  ).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`lab-attendance:attendance-qr:v1\0${payload}`)
    .digest('base64url');

  return `${payload}.${signature}`;
}
