import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { Settings } from '@shared/types'

const file = () => join(app.getPath('userData'), 'settings.json')

export function loadSettings(): Settings {
  try {
    const raw: unknown = JSON.parse(readFileSync(file(), 'utf8'))
    if (raw && typeof raw === 'object' && typeof (raw as Settings).gameDir === 'string') {
      return { gameDir: (raw as Settings).gameDir }
    }
  } catch {
    // missing or corrupt: start fresh
  }
  return {}
}

export function saveSettings(s: Settings): void {
  writeFileSync(file(), JSON.stringify(s, null, 2))
}
