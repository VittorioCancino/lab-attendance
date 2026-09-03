import { access, cp, mkdir } from 'node:fs/promises';

const standaloneDirectory = '.next/standalone';

await mkdir(`${standaloneDirectory}/.next`, { recursive: true });
await cp('.next/static', `${standaloneDirectory}/.next/static`, {
  force: true,
  recursive: true,
});

try {
  await access('public');
  await cp('public', `${standaloneDirectory}/public`, {
    force: true,
    recursive: true,
  });
} catch {
  // The application currently has no public asset directory.
}
