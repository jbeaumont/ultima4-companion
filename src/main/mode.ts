// Test mode: a fully separate companion instance for automated play-testing.
// Started with `--test` (npm run dev:test). It uses its own userData folder, so
// its journal, fog, snapshots and settings never mix with the player's, and the
// game it launches writes to a test save overlay inside that folder.
import { app } from 'electron'
import { join } from 'node:path'
import { realOverlay } from './saveLocation'
import type { SaveLocation } from './saveLocation'

export const TEST_MODE = process.argv.includes('--test') || process.env['U4C_TEST'] === '1'

/** Must run before anything reads app.getPath('userData'). */
export function applyMode(): void {
  if (TEST_MODE) app.setPath('userData', join(app.getPath('appData'), 'ultima4-companion-test'))
}

/** The DOSBox overlay this instance reads and writes: real saves, or the test folder. */
export const overlayDir = (gameDir: string): string =>
  TEST_MODE ? join(app.getPath('userData'), 'game-saves') : realOverlay(gameDir)

/** Root under which test overlays may be written (only meaningful in test mode). */
export const testRoot = (gameDir: string): string => (TEST_MODE ? join(app.getPath('userData'), 'game-saves') : realOverlay(gameDir))

export const saveLocationFor = (gameDir: string): SaveLocation => ({
  kind: TEST_MODE ? 'test' : 'real',
  gameDir,
  overlayDir: overlayDir(gameDir)
})
