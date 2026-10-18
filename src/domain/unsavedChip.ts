// Presentation of the unsaved-progress warning. Pure, so it is testable.
export type UnsavedLevel = 'ok' | 'warn' | 'bad'

export const UNSAVED_WARN = 50
export const UNSAVED_BAD = 200

export interface UnsavedChip {
  level: UnsavedLevel
  text: string
  /** Full text with the "how to save" hint. */
  hint: string
}

/** The chip for `moves` unsaved moves, or null when there is nothing to warn about. */
export function unsavedChip(moves: number | null | undefined, canSave: boolean): UnsavedChip | null {
  if (typeof moves !== 'number' || !(moves > 0)) return null
  const text = `Unsaved: ${moves} move${moves === 1 ? '' : 's'}`
  const level: UnsavedLevel = moves >= UNSAVED_BAD ? 'bad' : moves >= UNSAVED_WARN ? 'warn' : 'ok'
  return { level, text, hint: `${text} · ${canSave ? 'press Q to save' : 'step outside, then press Q'}` }
}
