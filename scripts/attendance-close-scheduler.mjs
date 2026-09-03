import { writeFile } from 'node:fs/promises';

const INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const SUCCESS_MARKER_PATH = '/tmp/lab-attendance-cron-success';

function log(outcome) {
  process.stdout.write(
    `${JSON.stringify({
      event: 'attendance_close_scheduler',
      outcome,
      timestamp: new Date().toISOString(),
      version: 1,
    })}\n`,
  );
}

function readConfiguration() {
  const publicUrl = process.env.LAB_INSTANCE_PUBLIC_URL;
  const secret = process.env.ATTENDANCE_CRON_SECRET;

  if (publicUrl === undefined || secret === undefined) {
    throw new Error('Scheduler configuration is incomplete.');
  }

  const origin = new URL(publicUrl);

  if (
    origin.protocol !== 'https:' ||
    origin.username !== '' ||
    origin.password !== '' ||
    origin.pathname !== '/' ||
    origin.search !== '' ||
    origin.hash !== '' ||
    secret.length < 32 ||
    secret.length > 512
  ) {
    throw new Error('Scheduler configuration is invalid.');
  }

  return {
    endpoint: new URL('/api/cron/attendance/close', origin),
    secret,
  };
}

let activeController;
let stopped = false;
let timer;

async function execute(configuration) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  activeController = controller;

  try {
    const response = await fetch(configuration.endpoint, {
      headers: { Authorization: `Bearer ${configuration.secret}` },
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
    });

    if (!response.ok) {
      log('rejected');
      return;
    }

    await writeFile(SUCCESS_MARKER_PATH, new Date().toISOString(), {
      encoding: 'utf8',
      mode: 0o600,
    });
    log('succeeded');
  } catch {
    log('failed');
  } finally {
    clearTimeout(timeout);
    activeController = undefined;
  }
}

async function schedule(configuration) {
  await execute(configuration);

  if (!stopped) {
    timer = setTimeout(() => void schedule(configuration), INTERVAL_MS);
  }
}

function stop() {
  stopped = true;
  clearTimeout(timer);
  activeController?.abort();
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);

try {
  const configuration = readConfiguration();

  void schedule(configuration);
} catch {
  log('configuration_invalid');
  process.exitCode = 1;
}
