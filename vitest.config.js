import { defineConfig } from 'vitest/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/**/*.test.{js,ts}',
    ],
    exclude: [
      '.mimocode/**',
      'node_modules/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@main': path.resolve(__dirname, 'src/main'),
      '@domain': path.resolve(__dirname, 'src/main/domain'),
      '@application': path.resolve(__dirname, 'src/main/application'),
      '@infrastructure': path.resolve(__dirname, 'src/main/infrastructure'),
    },
  },
})
