import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
  },
  define: {
    __USE_REAL_MODEL__: JSON.stringify(false),
  },
});
