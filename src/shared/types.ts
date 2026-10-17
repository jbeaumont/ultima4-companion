import type { PartySave } from '@parsers/party'

/** Everything the renderer needs to know; plain data, safe for IPC. */
export interface GameState {
  status: 'ok' | 'noGame' | 'noSave' | 'error'
  message?: string
  source: 'saveFile' // 'memory' arrives in a later milestone
  gameDir: string | null
  savePath: string | null
  updatedAt: number | null
  party: PartySave | null
}

export interface Settings {
  gameDir?: string
}

export interface SettingsInfo {
  gameDir: string | null
  savePath: string | null
  override: string | null
}

/** A producer of GameState; save-file watcher now, memory reader later. */
export interface StateSource {
  start(onState: (state: GameState) => void): void
  stop(): Promise<void>
}

export const IPC = {
  getState: 'state:get',
  stateChanged: 'state:changed',
  getSettings: 'settings:get',
  chooseDir: 'game:chooseDir',
  assetsBase: 'assets:base',
  assetsLocation: 'assets:location',
  journalGet: 'journal:get',
  journalSave: 'journal:save',
  journalChanged: 'journal:changed'
} as const

/** Raw bytes of the shared map assets; the renderer parses them. */
export interface BaseAssets {
  shapes: Uint8Array
  world: Uint8Array
}

/** Raw files for one location, keyed by role: ult, ult2, tlk or dng. */
export interface LocationAssets {
  kind: 'castle' | 'town' | 'dungeon'
  files: Record<string, Uint8Array>
}
