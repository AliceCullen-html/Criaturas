import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// Config dedicada de testes (mantém o vite.config.ts livre dos tipos do Vitest).
export default defineConfig({
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
      '@world': fileURLToPath(new URL('./src/world', import.meta.url)),
      '@creatures': fileURLToPath(new URL('./src/creatures', import.meta.url)),
      '@genetics': fileURLToPath(new URL('./src/genetics', import.meta.url)),
      '@ai': fileURLToPath(new URL('./src/ai', import.meta.url)),
      '@simulation': fileURLToPath(new URL('./src/simulation', import.meta.url)),
      '@rendering': fileURLToPath(new URL('./src/rendering', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      '@save': fileURLToPath(new URL('./src/save', import.meta.url)),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@assets': fileURLToPath(new URL('./src/assets', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
