import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { parseHudBounds } from '@shared/hudBounds'
import type { Settings } from '@shared/types'

const file = () => join(app.getPath('userData'), 'settings.json')

export function loadSettings(): Settings {
  const out: Settings = {}
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as Record<string, unknown>
    if (raw && typeof raw === 'object') {
      if (typeof raw.gameDir === 'string') out.gameDir = raw.gameDir
      if (typeof raw.liveMemory === 'boolean') out.liveMemory = raw.liveMemory
      const hud = parseHudBounds(raw.hudBounds)
      if (hud) out.hudBounds = hud
    }
  } catch {
    // missing or corrupt: start fresh
  }
  return out
}

/** Merge into the stored settings. */
export function saveSettings(s: Settings): void {
  writeFileSync(file(), JSON.stringify({ ...loadSettings(), ...s }, null, 2))
}
