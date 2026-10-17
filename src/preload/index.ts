import { contextBridge } from 'electron'

// Typed bridge to the main process; IPC channels are added in milestone 3.
const api = {
  version: '0.1.0'
}

export type U4Api = typeof api

contextBridge.exposeInMainWorld('u4', api)
