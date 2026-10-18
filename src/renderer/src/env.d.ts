/// <reference types="vite/client" />
import type { U4Api } from '../../preload/index'

declare global {
  interface Window {
    u4: U4Api
  }
}
