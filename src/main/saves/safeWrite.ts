// The one path through which the companion writes to the game. Every write:
//  1. refuses while DOSBox is running (the game would overwrite or misread it),
//  2. only touches whitelisted save files, and only inside the DOSBox overlay:
//     <game>/cloud_saves (GOG's, the real saves) or the companion's test-save folder,
//  3. takes a snapshot of the current files first,
//  4. writes each file atomically (temp file + rename).
// The caller is responsible for the user's explicit confirmation before calling.
import { existsSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PARTY_SAV_SIZE } from '@parsers/party'
import { isAllowedOverlay, realOverlay } from '../saveLocation'
import { isSaveFile } from './snapshots'
import type { SaveFile, SnapshotMeta, SnapshotReason, SnapshotStore } from './snapshots'

export class WriteRefused extends Error {}

export interface SafeWriteDeps {
  isGameRunning: () => Promise<boolean>
  snapshots: Pick<SnapshotStore, 'take'>
  /** Folder under which test overlays may live (writes elsewhere are refused). */
  testRoot?: string
}

export type WriteTarget = string | { gameDir: string; overlayDir: string } | null

const EXPECTED_SIZE: Partial<Record<SaveFile, number>> = {
  'PARTY.SAV': PARTY_SAV_SIZE,
  'MONSTERS.SAV': 256,
  'OUTMONST.SAV': 256,
  'DNGMAP.SAV': 512
}

export async function writeSaveFiles(
  target: WriteTarget,
  files: Partial<Record<string, Uint8Array>>,
  reason: Extract<SnapshotReason, 'pre-restore' | 'pre-edit'>,
  deps: SafeWriteDeps
): Promise<{ backup: SnapshotMeta | null; written: SaveFile[] }> {
  const gameDir = typeof target === 'string' ? target : target?.gameDir ?? null
  if (!gameDir || !existsSync(join(gameDir, 'WORLD.MAP'))) throw new WriteRefused('Ultima IV install not found.')
  const dir = typeof target === 'object' && target ? target.overlayDir : realOverlay(gameDir)
  if (!isAllowedOverlay(dir, gameDir, deps.testRoot ?? realOverlay(gameDir))) throw new WriteRefused('Refusing to write outside the save overlay.')
  if (await deps.isGameRunning()) throw new WriteRefused('Close DOSBox first: the game must not be running while its save is changed.')

  const entries = Object.entries(files).filter((e): e is [string, Uint8Array] => !!e[1])
  if (!entries.length) throw new WriteRefused('Nothing to write.')
  for (const [name, bytes] of entries) {
    if (!isSaveFile(name)) throw new WriteRefused(`Refusing to write ${name}: not a save file.`)
    const want = EXPECTED_SIZE[name]
    if (want !== undefined && bytes.length !== want) throw new WriteRefused(`${name} must be ${want} bytes, got ${bytes.length}.`)
  }

  const backup = await deps.snapshots.take(gameDir, reason, undefined, new Date(), dir)
  await mkdir(dir, { recursive: true })
  for (const [name, bytes] of entries) {
    const out = join(dir, name)
    const tmp = `${out}.u4c.tmp`
    await writeFile(tmp, bytes)
    await rename(tmp, out)
  }
  return { backup, written: entries.map(([n]) => n as SaveFile) }
}
