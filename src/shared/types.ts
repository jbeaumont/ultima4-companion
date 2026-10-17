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
  chooseDir: 'game:chooseDir'
} as const
