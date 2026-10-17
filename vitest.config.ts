import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@parsers': resolve('src/parsers'),
      '@domain': resolve('src/domain'),
      '@shared': resolve('src/shared')
    }
  },
  test: { include: ['tests/**/*.test.ts'] }
})
