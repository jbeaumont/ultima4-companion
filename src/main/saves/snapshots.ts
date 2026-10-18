// Versioned backups of the game's save files. Ultima IV has a single save slot,
// so every change to PARTY.SAV is copied into userData/snapshots/<id>/. No
// Electron imports: the root folder is passed in, so this is testable in Node.
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parsePartySav } from '@parsers/party'
import { LOCATIONS } from '@domain/constants'

/** The only files the companion ever reads into or writes back to the game. */
export const SAVE_FILES = ['PARTY.SAV', 'MONSTERS.SAV', 'OUTMONST.SAV', 'DNGMAP.SAV'] as const
export type SaveFile = (typeof SAVE_FILES)[number]
export const isSaveFile = (name: string): name is SaveFile => (SAVE_FILES as readonly string[]).includes(name)

export type SnapshotReason = 'auto' | 'manual' | 'pre-restore' | 'pre-edit'

export interface SnapshotMeta {
  id: string
  createdAt: number
  reason: SnapshotReason
  label?: string
  hash: string
  files: SaveFile[]
  summary: { names: string[]; moves: number; location: string; x: number; y: number; avatarCount: number } | null
}

const KEEP_AUTO = 50

/**
 * The files DOSBox actually sees: GOG mounts cloud_saves as an overlay, so a file
 * there wins over the copy in the game folder.
 */
export function effectiveSavePaths(gameDir: string, exists: (p: string) => boolean = existsSync, overlayDir = join(gameDir, 'cloud_saves')): Partial<Record<SaveFile, string>> {
  const out: Partial<Record<SaveFile, string>> = {}
  for (const f of SAVE_FILES) {
    const cloud = join(overlayDir, f)
    const root = join(gameDir, f)
    if (exists(cloud)) out[f] = cloud
    else if (exists(root)) out[f] = root
  }
  return out
}

export function snapshotId(at: Date, reason: SnapshotReason): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}-${p(at.getMilliseconds(), 3)}-${reason}`
}

export function hashFiles(files: Partial<Record<SaveFile, Uint8Array>>): string {
  const h = createHash('sha1')
  for (const f of SAVE_FILES) {
    const b = files[f]
    if (b) h.update(f).update(b)
  }
  return h.digest('hex')
}

function summarize(party: Uint8Array | undefined): SnapshotMeta['summary'] {
  if (!party) return null
  try {
    const p = parsePartySav(party)
    return {
      names: p.allRecords.slice(0, Math.max(1, p.memberCount)).map((r) => r.name),
      moves: p.moves,
      location: p.location === 0 ? 'Britannia' : LOCATIONS[p.location]?.name ?? `Location ${p.location}`,
      x: p.x,
      y: p.y,
      avatarCount: p.karma.filter((k) => k === 0).length
    }
  } catch {
    return null
  }
}

/** Which snapshots pruning removes: auto ones beyond the newest `keep`; others are kept. */
export function toPrune(metas: SnapshotMeta[], keep = KEEP_AUTO): string[] {
  return metas
    .filter((m) => m.reason === 'auto')
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(keep)
    .map((m) => m.id)
}

export class SnapshotStore {
  constructor(private readonly root: string) {}

  async list(): Promise<SnapshotMeta[]> {
    let ids: string[]
    try {
      ids = await readdir(this.root)
    } catch {
      return []
    }
    const metas: SnapshotMeta[] = []
    for (const id of ids) {
      if (id.startsWith('.')) continue // in-progress temp folder
      try {
        metas.push(JSON.parse(await readFile(join(this.root, id, 'meta.json'), 'utf8')) as SnapshotMeta)
      } catch {
        // incomplete or foreign folder: ignore
      }
    }
    return metas.sort((a, b) => b.createdAt - a.createdAt)
  }

  /** Copy the game's current save files. Auto snapshots identical to the newest one are skipped. */
  async take(gameDir: string, reason: SnapshotReason, label?: string, now = new Date(), overlayDir?: string): Promise<SnapshotMeta | null> {
    const files: Partial<Record<SaveFile, Uint8Array>> = {}
    for (const [f, path] of Object.entries(effectiveSavePaths(gameDir, existsSync, overlayDir)) as [SaveFile, string][]) {
      files[f] = new Uint8Array(await readFile(path))
    }
    if (!files['PARTY.SAV']) return null
    const hash = hashFiles(files)
    const existing = await this.list()
    if (reason === 'auto' && existing[0]?.hash === hash) return null

    const meta: SnapshotMeta = {
      id: snapshotId(now, reason),
      createdAt: now.getTime(),
      reason,
      ...(label ? { label: label.slice(0, 80) } : {}),
      hash,
      files: Object.keys(files) as SaveFile[],
      summary: summarize(files['PARTY.SAV'])
    }
    // build in a temp folder and rename, so a crash never leaves a half snapshot
    const tmp = join(this.root, `.${meta.id}.tmp`)
    await mkdir(tmp, { recursive: true })
    for (const f of meta.files) await writeFile(join(tmp, f), files[f]!)
    await writeFile(join(tmp, 'meta.json'), JSON.stringify(meta, null, 2))
    await rename(tmp, join(this.root, meta.id))

    for (const id of toPrune([meta, ...existing])) await this.remove(id)
    return meta
  }

  async read(id: string): Promise<{ meta: SnapshotMeta; files: Partial<Record<SaveFile, Uint8Array>> }> {
    if (!/^[\w-]+$/.test(id)) throw new Error('Invalid snapshot id')
    const dir = join(this.root, id)
    const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')) as SnapshotMeta
    const files: Partial<Record<SaveFile, Uint8Array>> = {}
    for (const f of meta.files) if (isSaveFile(f)) files[f] = new Uint8Array(await readFile(join(dir, f)))
    if (hashFiles(files) !== meta.hash) throw new Error('Snapshot is damaged (checksum mismatch)')
    return { meta, files }
  }

  async remove(id: string): Promise<void> {
    if (!/^[\w-]+$/.test(id)) throw new Error('Invalid snapshot id')
    await rm(join(this.root, id), { recursive: true, force: true })
  }
}
