// Where the game's saves live. DOSBox mounts the game folder read-mostly and an
// overlay folder on top that receives every write. GOG's overlay is
// <game>/cloud_saves (the player's real saves); the test launch profile uses a
// separate overlay in userData so testing never touches the real saves.
import { join, relative, resolve } from 'node:path'

export type SaveKind = 'real' | 'test'

export interface SaveLocation {
  kind: SaveKind
  gameDir: string
  overlayDir: string
}

export const realOverlay = (gameDir: string): string => join(gameDir, 'cloud_saves')

export function saveLocation(kind: SaveKind, gameDir: string, testOverlay: string): SaveLocation {
  return { kind, gameDir, overlayDir: kind === 'test' ? testOverlay : realOverlay(gameDir) }
}

const inside = (child: string, parent: string): boolean => {
  const r = relative(resolve(parent), resolve(child))
  return r === '' || (!r.startsWith('..') && !r.includes(':'))
}

/** The only overlay folders the companion may write to. */
export function isAllowedOverlay(overlayDir: string, gameDir: string, testRoot: string): boolean {
  return resolve(overlayDir) === resolve(realOverlay(gameDir)) || inside(overlayDir, testRoot)
}
