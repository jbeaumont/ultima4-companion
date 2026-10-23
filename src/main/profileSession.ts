// The profile store for this run of the app (userData depends on test mode, so it
// is created after applyMode()).
import { app } from 'electron'
import { ProfileStore } from './profiles'

let store: ProfileStore | null = null

export function profiles(): ProfileStore {
  store ??= new ProfileStore(app.getPath('userData'))
  return store
}

/** Folder of the active playthrough: its journal and explored-map files. */
export const profileDir = (): string => profiles().dir()
