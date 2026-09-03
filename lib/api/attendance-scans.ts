import type { AttendanceQrExchangeResponse } from '@/lib/types/attendance-scan.types';

export async function exchangeAttendanceQr(
  token: string,
  signal?: AbortSignal,
): Promise<AttendanceQrExchangeResponse> {
  const response = await fetch('/api/attendance/scan/exchange', {
    body: JSON.stringify({ token }),
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    signal,
  });
  const body: unknown = await response.json();

  if (
    typeof body === 'object' &&
    body !== null &&
    'ok' in body &&
    body.ok === true
  ) {
    return { ok: true };
  }

  return {
    error: 'El código QR no es válido o ha expirado.',
    ok: false,
  };
}
