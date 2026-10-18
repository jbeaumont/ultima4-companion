import type { PartySave } from '@parsers/party'
import type { HudBounds } from './hudBounds'

/** Everything the renderer needs to know; plain data, safe for IPC. */
export interface GameState {
  status: 'ok' | 'noGame' | 'noSave' | 'error'
  message?: string
  source: 'saveFile' | 'memory'
  gameDir: string | null
  savePath: string | null
  updatedAt: number | null
  party: PartySave | null
}

export interface Settings {
  gameDir?: string
  /** Read live state from DOSBox memory (default on). */
  liveMemory?: boolean
  /** Last position and size of the pop-out HUD window. */
  hudBounds?: HudBounds
}

export interface SettingsInfo {
  gameDir: string | null
  savePath: string | null
  override: string | null
  liveMemory: boolean
  /** DOSBox process currently attached by the memory reader. */
  attachedPid: number | null
}

/** A producer of GameState: save-file watcher, memory reader, or both (HybridSource). */
export interface StateSource {
  start(onState: (state: GameState) => void): void
  stop(): Promise<void>
}

export const IPC = {
  getState: 'state:get',
  stateChanged: 'state:changed',
  getSettings: 'settings:get',
  chooseDir: 'game:chooseDir',
  setLiveMemory: 'settings:liveMemory',
  assetsBase: 'assets:base',
  assetsLocation: 'assets:location',
  journalGet: 'journal:get',
  journalSave: 'journal:save',
  journalChanged: 'journal:changed',
  exploredGet: 'explored:get',
  exploredChanged: 'explored:changed',
  exploredReset: 'explored:reset',
  hudToggle: 'hud:toggle'
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
