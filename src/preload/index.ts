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
  getBaseAssets: (): Promise<BaseAssets | null> => ipcRenderer.invoke(IPC.assetsBase),
  getLocationAssets: (id: number): Promise<LocationAssets | null> => ipcRenderer.invoke(IPC.assetsLocation, id),
  getJournal: (): Promise<Journal> => ipcRenderer.invoke(IPC.journalGet),
  saveJournal: (j: Journal): Promise<Journal> => ipcRenderer.invoke(IPC.journalSave, j)
}

export type U4Api = typeof api

contextBridge.exposeInMainWorld('u4', api)
