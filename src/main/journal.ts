import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { recordVisit } from '@domain/hints'
import { emptyJournal, mergeMet, mergeVisited, metKey, normalizeJournal, parseJournal } from '@shared/journal'
import type { Journal } from '@shared/journal'

// Lives in userData, never in the (read-only) game folder.
const file = () => join(app.getPath('userData'), 'journal.json')

export async function loadJournal(): Promise<Journal> {
  try {
    return parseJournal(await readFile(file(), 'utf8'))
  } catch {
    return emptyJournal() // missing file
  }
}

// serialize writes so overlapping saves can't race on the temp file
let queue: Promise<unknown> = Promise.resolve()
let current: Journal | null = null // last journal written or read, only touched inside the queue

async function write(journal: Journal): Promise<Journal> {
  const tmp = `${file()}.tmp`
  await writeFile(tmp, JSON.stringify(journal, null, 2))
  await rename(tmp, file())
  current = journal
  return journal
}

const enqueue = <T>(run: () => Promise<T>): Promise<T> => {
  const next = queue.then(run, run)
  queue = next.catch(() => undefined)
  return next
}

export function saveJournal(raw: unknown): Promise<Journal> {
  const incoming = normalizeJournal(raw)
  return enqueue(async () => {
    current ??= await loadJournal()
    return write({ ...incoming, visited: mergeVisited(current.visited, incoming.visited), met: mergeMet(current.met, incoming.met) })
  })
}

/** Record a settlement visit; resolves to the updated journal, or null when nothing changed. */
export function recordJournalVisit(location: number): Promise<Journal | null> {
  return enqueue(async () => {
    current ??= await loadJournal()
    const visited = recordVisit(current.visited, location)
    if (visited.length === current.visited.length) return null
    return write({ ...current, visited })
  })
}

/** Test instance only: start the journal afresh, keeping the hint and dialogue settings. */
export function resetJournal(): Promise<Journal> {
  return enqueue(async () => {
    current ??= await loadJournal()
    return write({ ...emptyJournal(), spoilerLevel: current.spoilerLevel, dialogueMode: current.dialogueMode })
  })
}

/** Record someone the party talked to; resolves to the updated journal, or null when already known. */
export function recordJournalMet(location: number, name: string): Promise<Journal | null> {
  return enqueue(async () => {
    current ??= await loadJournal()
    const met = mergeMet(current.met, [metKey(location, name)])
    if (met.length === current.met.length) return null
    return write({ ...current, met })
  })
}
