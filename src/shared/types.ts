import type { BattleState } from '@parsers/battle'
import type { PartySave } from '@parsers/party'
import type { HudBounds } from './hudBounds'
import type { Speed } from './speed'

/**
 * How the state was observed, separate from what it says: which live attachment
 * (session), how many successful reads so far (sequence, which grows even when
 * nothing changes), when the last good read was, and whether it is live, live but
 * failing consistency checks, a fallback after the game went away, or a save file.
 */
export interface Observation {
  session: string
  sequence: number
  observedAt: number
  status: 'live' | 'retrying' | 'detached' | 'saveFile'
  /** Memory layout the reader assumed (live only). */
  layout?: string
  /** Consecutive inconsistent samples (live only). */
  failures?: number
}

/** Everything the renderer needs to know; plain data, safe for IPC. */
export interface GameState {
  status: 'ok' | 'noGame' | 'noSave' | 'error'
  message?: string
  source: 'saveFile' | 'memory'
  gameDir: string | null
  savePath: string | null
  updatedAt: number | null
  party: PartySave | null
  /** Live mode only: moves made since the last save (null when it can't be compared). */
  unsavedMoves?: number | null
  /** Live mode only: the battle in progress, if any. */
  battle?: BattleState | null
  /** Live mode only: the last person talked to since attaching (from the game's current-conversation record). */
  lastTalk?: { name: string; serial: number } | null
  /** Provenance and freshness of this state (see Observation). */
  observation?: Observation
}

export interface Settings {
  gameDir?: string
  /** Read live state from DOSBox memory (default on). */
  liveMemory?: boolean
  /** Last position and size of the pop-out HUD window. */
  hudBounds?: HudBounds
  /** Allow editing the save (off by default). */
  editorEnabled?: boolean
  /** Show the optional AI sage (off by default; nothing Anthropic-related loads until on). */
  sageEnabled?: boolean
  /** The first-run welcome has been finished or skipped. */
  welcomeSeen?: boolean
  /** Game speed preset for launches and the live control (#70). */
  gameSpeed?: Speed
}

export interface SettingsInfo {
  gameDir: string | null
  savePath: string | null
  override: string | null
  liveMemory: boolean
  /** DOSBox process currently attached by the memory reader. */
  attachedPid: number | null
  editorEnabled: boolean
  sageEnabled: boolean
  welcomeSeen: boolean
  /** This is a --test instance: isolated data, test saves, turbo launch profile. */
  testMode: boolean
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
  setEditorEnabled: 'settings:editorEnabled',
  setSageEnabled: 'settings:sageEnabled',
  launchGame: 'launcher:launch',
  seedTestSaves: 'launcher:seedTest',
  resetTestJournal: 'journal:resetTest',
  profilesList: 'profiles:list',
  profileCreate: 'profiles:create',
  setWelcomeSeen: 'settings:welcome-seen',
  gameSpeedGet: 'speed:get',
  gameSpeedSet: 'speed:set',
  profileFollow: 'profiles:follow',
  profileSwitch: 'profiles:switch',
  profileRename: 'profiles:rename',
  snapshotsList: 'snapshots:list',
  snapshotsTake: 'snapshots:take',
  snapshotsRestore: 'snapshots:restore',
  snapshotsDelete: 'snapshots:delete',
  snapshotsChanged: 'snapshots:changed',
  editorLoad: 'editor:load',
  editorApply: 'editor:apply',
  sageAsk: 'sage:ask',
  sageDelta: 'sage:delta',
  sageDone: 'sage:done',
  sageCancel: 'sage:cancel',
  sageReset: 'sage:reset',
  sageStatus: 'sage:status',
  sageSetKey: 'sage:setKey',
  sageClearKey: 'sage:clearKey',
  assetsBase: 'assets:base',
  assetsLocation: 'assets:location',
  assetsImage: 'assets:image',
  assetsDngmap: 'assets:dngmap',
  journalGet: 'journal:get',
  journalSave: 'journal:save',
  journalChanged: 'journal:changed',
  exploredGet: 'explored:get',
  exploredChanged: 'explored:changed',
  exploredReset: 'explored:reset',
  dungeonFogGet: 'dungeonFog:get',
  dungeonFogChanged: 'dungeonFog:changed',
  dungeonFogReset: 'dungeonFog:reset',
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
