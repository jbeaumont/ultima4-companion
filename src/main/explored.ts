import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { emptyFog, reveal, validFog } from '@domain/fog'
import type { PartySave } from '@parsers/party'

// Lives in userData, never in the (read-only) game folder.
const file = () => join(app.getPath('userData'), 'explored.bin')

const SAVE_MS = 5000
const PUSH_MS = 500

let bits = emptyFog()
let onChanged: ((bits: Uint8Array) => void) | null = null
let dirty = false
let saveTimer: NodeJS.Timeout | null = null
let pushTimer: NodeJS.Timeout | null = null

// serialize writes so overlapping saves can't race on the temp file
let queue: Promise<unknown> = Promise.resolve()

const write = (data: Uint8Array): Promise<void> => {
  const run = async () => {
    const tmp = `${file()}.tmp`
    await writeFile(tmp, data)
    await rename(tmp, file())
  }
  const next = queue.then(run, run)
  queue = next.catch(() => undefined)
  return next
}

/** Write now if anything changed since the last write. */
export function flushExplored(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = null
  if (!dirty) return queue.then(() => undefined)
  dirty = false
  return write(bits.slice()).catch(() => {
    dirty = true // retry on the next change or at quit
  })
}

const scheduleSave = (): void => {
  dirty = true
  saveTimer ??= setTimeout(() => void flushExplored(), SAVE_MS)
}

const schedulePush = (): void => {
  pushTimer ??= setTimeout(() => {
    pushTimer = null
    onChanged?.(bits)
  }, PUSH_MS)
}

export async function loadExplored(push: (bits: Uint8Array) => void): Promise<void> {
  onChanged = push
  try {
    const raw = new Uint8Array(await readFile(file()))
    if (validFog(raw)) bits = raw
  } catch {
    // missing or corrupt: start fresh
  }
  let quitting = false
  app.on('before-quit', (e) => {
    if (!dirty || quitting) return
    quitting = true
    e.preventDefault() // finish the write, then quit for real
    void flushExplored().finally(() => app.quit())
  })
}

export const getExplored = (): Uint8Array => bits

export function resetExplored(): Uint8Array {
  bits = emptyFog()
  dirty = true
  void flushExplored()
  onChanged?.(bits)
  return bits
}

/** Reveal around the party: on the surface where it stands, indoors where it entered. */
export function trackExplored(party: PartySave | null): void {
  if (!party) return
  const surface = party.location === 0
  const x = surface ? party.x : party.outX
  const y = surface ? party.y : party.outY
  if (!reveal(bits, x, y)) return
  scheduleSave()
  schedulePush()
}
