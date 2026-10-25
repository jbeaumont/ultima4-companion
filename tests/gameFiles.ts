import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Real game install, used for local-only tests. Override with U4_DIR. */
export const GAME_DIR = process.env['U4_DIR'] || 'C:\\Program Files\\GOG Galaxy\\Games\\Ultima 4'
export const hasGame = existsSync(join(GAME_DIR, 'WORLD.MAP'))

export function gameFile(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(GAME_DIR, name)))
}
