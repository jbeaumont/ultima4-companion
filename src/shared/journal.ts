// Journal data model plus pure validation; no Node/Electron/DOM imports so tests and both processes can use it.
export interface Clue {
  id: string
  text: string
  source?: string
  location?: string
  createdAt: number
}

export interface Journal {
  notes: string
  clues: Clue[]
}

export const MAX_NOTES = 200_000
export const MAX_CLUES = 2000
const MAX_FIELD = 2000

export const emptyJournal = (): Journal => ({ notes: '', clues: [] })

const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' ? v.slice(0, max) : undefined)

function normalizeClue(raw: unknown, i: number): Clue | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const text = str(r.text, MAX_FIELD)?.trim()
  if (!text) return null
  const clue: Clue = {
    id: str(r.id, 100) || `legacy-${i}`,
    text,
    createdAt: typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) ? r.createdAt : 0
  }
  const source = str(r.source, MAX_FIELD)?.trim()
  const location = str(r.location, MAX_FIELD)?.trim()
  if (source) clue.source = source
  if (location) clue.location = location
  return clue
}

/** Coerce anything (parsed JSON, IPC payload) into a valid Journal: unknown fields dropped, bad clues skipped, duplicate ids made unique. */
export function normalizeJournal(raw: unknown): Journal {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyJournal()
  const r = raw as Record<string, unknown>
  const seen = new Set<string>()
  const clues: Clue[] = []
  if (Array.isArray(r.clues)) {
    for (const [i, c] of r.clues.slice(0, MAX_CLUES).entries()) {
      const clue = normalizeClue(c, i)
      if (!clue) continue
      while (seen.has(clue.id)) clue.id += '_'
      seen.add(clue.id)
      clues.push(clue)
    }
  }
  return { notes: str(r.notes, MAX_NOTES) ?? '', clues }
}

/** Parse the file text; corrupt JSON falls back to an empty journal. */
export function parseJournal(text: string): Journal {
  try {
    return normalizeJournal(JSON.parse(text))
  } catch {
    return emptyJournal()
  }
}
