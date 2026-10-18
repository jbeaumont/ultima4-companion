import { contextBridge, ipcRenderer } from 'electron'
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
