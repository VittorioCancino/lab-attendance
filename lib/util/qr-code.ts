import { DISPLAY_ACTIVATION_CODE_LENGTH } from '@/lib/const/qr';

export function normalizeDisplayActivationCode(code: string): string {
  return code
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .replaceAll('O', '0')
    .replace(/[IL]/g, '1');
}

export function formatDisplayActivationCode(code: string): string {
  return normalizeDisplayActivationCode(code)
    .slice(0, DISPLAY_ACTIVATION_CODE_LENGTH)
    .replace(/(.{4})(?=.)/g, '$1-');
}
