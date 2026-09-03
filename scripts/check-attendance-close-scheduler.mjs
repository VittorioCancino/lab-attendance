import { stat } from 'node:fs/promises';

const STALE_AFTER_MS = 180_000;
const SUCCESS_MARKER_PATH = '/tmp/lab-attendance-cron-success';

try {
  const marker = await stat(SUCCESS_MARKER_PATH);

  if (Date.now() - marker.mtimeMs > STALE_AFTER_MS) {
    process.exitCode = 1;
  }
} catch {
  process.exitCode = 1;
}
