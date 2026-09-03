import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDirectory = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: 'server-only',
        replacement: resolve(rootDirectory, 'tests/shims/server-only.ts'),
      },
      {
        find: '@',
        replacement: rootDirectory,
      },
    ],
  },
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['tests/integration/**/*.test.ts'],
  },
});
