import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const DEFAULT_GAME_DIR = 'C:\\Program Files\\GOG Galaxy\\Games\\Ultima 4'
const REG_KEY = 'HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games\\1207662433'

export type Exists = (path: string) => boolean

export const isGameDir = (dir: string, exists: Exists): boolean => exists(join(dir, 'WORLD.MAP'))

/** First valid candidate wins; undefined/empty candidates are skipped. */
export function selectGameDir(candidates: (string | undefined | null)[], exists: Exists): string | null {
  for (const c of candidates) {
    if (c && isGameDir(c, exists)) return c
  }
  return null
}

export const cloudSavePath = (gameDir: string, overlayDir = join(gameDir, 'cloud_saves')): string => join(overlayDir, 'PARTY.SAV')
export const rootSavePath = (gameDir: string): string => join(gameDir, 'PARTY.SAV')

/** Prefer the DOSBox overlay (cloud_saves by default), fall back to the pristine root copy. */
export function pickSavePath(gameDir: string | null, exists: Exists, overlayDir?: string): string | null {
  if (!gameDir) return null
  if (exists(cloudSavePath(gameDir, overlayDir))) return cloudSavePath(gameDir, overlayDir)
  if (exists(rootSavePath(gameDir))) return rootSavePath(gameDir)
  return null
}

function registryGameDir(): Promise<string | null> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null)
    execFile('reg', ['query', REG_KEY, '/v', 'path'], { timeout: 3000, windowsHide: true }, (err, out) => {
      if (err) return resolve(null)
      const m = /^\s*path\s+REG_SZ\s+(.+?)\s*$/im.exec(out)
      resolve(m?.[1] ?? null)
    })
  })
}

/** Saved setting → U4_DIR → default GOG path → registry. */
export async function locateGameDir(saved?: string): Promise<string | null> {
  const quick = selectGameDir([saved, process.env['U4_DIR'], DEFAULT_GAME_DIR], existsSync)
  if (quick) return quick
  return selectGameDir([await registryGameDir()], existsSync)
}
