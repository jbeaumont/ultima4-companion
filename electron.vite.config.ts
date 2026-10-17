import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = {
  '@parsers': resolve('src/parsers'),
  '@domain': resolve('src/domain'),
  '@shared': resolve('src/shared')
}

export default defineConfig({
  main: { resolve: { alias } },
  preload: { resolve: { alias } },
  renderer: {
    resolve: { alias: { ...alias, '@renderer': resolve('src/renderer/src') } },
    plugins: [react()]
  }
})
