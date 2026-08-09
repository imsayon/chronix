import { defineConfig } from 'vitest/config';

process.env['NODE_ENV'] = 'test';
process.env['LOG_LEVEL'] = 'error';
// Every suite owns and stops its containers. Disabling Ryuk avoids requiring a
// privileged Docker-socket sidecar on SELinux hosts and ephemeral CI runners.
process.env['TESTCONTAINERS_RYUK_DISABLED'] = 'true';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.unit.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['src/**/*.integration.test.ts'],
          environment: 'node',
          testTimeout: 60_000,
          hookTimeout: 120_000,
          fileParallelism: false,
          maxWorkers: 1,
          pool: 'forks',
        },
      },
    ],
  },
});
