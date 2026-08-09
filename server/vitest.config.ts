import { defineConfig } from 'vitest/config';

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
          hookTimeout: 60_000,
          pool: 'forks',
          forks: { singleFork: true },
        },
      },
    ],
  },
});
