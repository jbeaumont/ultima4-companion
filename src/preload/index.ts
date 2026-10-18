import { contextBridge, ipcRenderer } from 'electron'
import type { PartySave } from '@parsers/party'
import type { SavesResult } from '../main/saves/savesIpc'
import type { SnapshotMeta } from '../main/saves/snapshots'
import { IPC } from '@shared/types'
import type { Journal } from '@shared/journal'
import type { BaseAssets, GameState, LocationAssets, SettingsInfo } from '@shared/types'

// Typed bridge to the main process; the renderer has no other access.
const api = {
  version: '0.1.0',
  getState: (): Promise<GameState | null> => ipcRenderer.invoke(IPC.getState),
  onState: (cb: (state: GameState) => void): (() => void) => {
    const handler = (_e: unknown, state: GameState) => cb(state)
    ipcRenderer.on(IPC.stateChanged, handler)
    return () => ipcRenderer.removeListener(IPC.stateChanged, handler)
  },
  getSettings: (): Promise<SettingsInfo> => ipcRenderer.invoke(IPC.getSettings),
  chooseGameDir: (): Promise<GameState | null> => ipcRenderer.invoke(IPC.chooseDir),
  setLiveMemory: (on: boolean): Promise<GameState | null> => ipcRenderer.invoke(IPC.setLiveMemory, on),
  setEditorEnabled: (on: boolean): Promise<boolean> => ipcRenderer.invoke(IPC.setEditorEnabled, on),
  listSnapshots: (): Promise<SnapshotMeta[]> => ipcRenderer.invoke(IPC.snapshotsList),
  takeSnapshot: (label?: string): Promise<SavesResult<SnapshotMeta | null>> => ipcRenderer.invoke(IPC.snapshotsTake, label),
  restoreSnapshot: (id: string): Promise<SavesResult<SnapshotMeta | null>> => ipcRenderer.invoke(IPC.snapshotsRestore, id),
  deleteSnapshot: (id: string): Promise<SavesResult<null>> => ipcRenderer.invoke(IPC.snapshotsDelete, id),
  onSnapshots: (cb: (list: SnapshotMeta[]) => void): (() => void) => {
    const handler = (_e: unknown, list: SnapshotMeta[]) => cb(list)
    ipcRenderer.on(IPC.snapshotsChanged, handler)
    return () => ipcRenderer.removeListener(IPC.snapshotsChanged, handler)
  },
  loadEditor: (): Promise<SavesResult<{ party: PartySave; path: string; gameRunning: boolean }>> => ipcRenderer.invoke(IPC.editorLoad),
  applyEdit: (party: PartySave): Promise<SavesResult<SnapshotMeta | null>> => ipcRenderer.invoke(IPC.editorApply, party),
  getBaseAssets: (): Promise<BaseAssets | null> => ipcRenderer.invoke(IPC.assetsBase),
  getLocationAssets: (id: number): Promise<LocationAssets | null> => ipcRenderer.invoke(IPC.assetsLocation, id),
  getJournal: (): Promise<Journal> => ipcRenderer.invoke(IPC.journalGet),
  saveJournal: (j: Journal): Promise<Journal> => ipcRenderer.invoke(IPC.journalSave, j),
  getExplored: (): Promise<Uint8Array> => ipcRenderer.invoke(IPC.exploredGet),
  resetExplored: (): Promise<Uint8Array> => ipcRenderer.invoke(IPC.exploredReset),
  onExplored: (cb: (bits: Uint8Array) => void): (() => void) => {
    const handler = (_e: unknown, bits: Uint8Array) => cb(bits)
    ipcRenderer.on(IPC.exploredChanged, handler)
    return () => ipcRenderer.removeListener(IPC.exploredChanged, handler)
  },
  /** Opens the pop-out HUD, or closes it when open; resolves to whether it is open. */
  toggleHud: (): Promise<boolean> => ipcRenderer.invoke(IPC.hudToggle),
  /** Main pushes the journal when it records a visit. */
  onJournal: (cb: (j: Journal) => void): (() => void) => {
    const handler = (_e: unknown, j: Journal) => cb(j)
    ipcRenderer.on(IPC.journalChanged, handler)
    return () => ipcRenderer.removeListener(IPC.journalChanged, handler)
  }
}

export type U4Api = typeof api

contextBridge.exposeInMainWorld('u4', api)
