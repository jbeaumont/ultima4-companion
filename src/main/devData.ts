// Development runs (`npm run dev`, not packaged, not --test) keep their own
// companion data, so a developer's installed copy never starts with dev
// experiments in it (#66). No Electron imports, so it is testable in Node.
import { cpSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export const INSTALLED_DATA = 'ultima4-companion'
export const DEV_DATA = 'ultima4-companion-dev'
export const TEST_DATA = 'ultima4-companion-test'

/** The companion's own files (Chromium's caches and the encrypted Sage key are left behind). */
export const COMPANION_FILES = ['settings.json', 'profiles.json', 'profiles', 'journal.json', 'explored.bin', 'explored-dungeons.bin'] as const

/** userData folder name for this run: test, dev, or null for the default (installed). */
export function dataFolder(test: boolean, packaged: boolean): string | null {
  if (test) return TEST_DATA
  return packaged ? null : DEV_DATA
}

/**
 * First dev run on a machine that used the shared folder before: copy (never move)
 * the companion's files across, so existing dev setups keep their playthroughs.
 * Returns the names copied; nothing happens once the dev folder exists.
 */
export function seedDevData(appData: string): string[] {
  const from = join(appData, INSTALLED_DATA)
  const to = join(appData, DEV_DATA)
  if (existsSync(to) || !existsSync(from)) return []
  const copied: string[] = []
  for (const f of COMPANION_FILES) {
    if (!existsSync(join(from, f))) continue
    cpSync(join(from, f), join(to, f), { recursive: true })
    copied.push(f)
  }
  return copied
}
