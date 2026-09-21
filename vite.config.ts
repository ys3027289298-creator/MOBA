import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { open: true, host: '127.0.0.1', port: 5180 },
  build: { target: 'es2020', sourcemap: false },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts']
  }
});
