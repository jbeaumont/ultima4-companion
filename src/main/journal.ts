import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { emptyJournal, normalizeJournal, parseJournal } from '@shared/journal'
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

export function saveJournal(raw: unknown): Promise<Journal> {
  const journal = normalizeJournal(raw)
  const run = async (): Promise<Journal> => {
    const tmp = `${file()}.tmp`
    await writeFile(tmp, JSON.stringify(journal, null, 2))
    await rename(tmp, file())
    return journal
  }
  const next = queue.then(run, run)
  queue = next.catch(() => undefined)
  return next
}
