// The game calls the fortune teller (and Inoo in Moonglow) by an ethnic slur.
// The companion never shows it: game text is reworded where it is displayed,
// and the raw data stays as the game has it for parsers and tests (#69).

// built from parts so the word itself never appears in the source
const SLUR = new RegExp(String.raw`\b${['gy', 'ps'].join('')}(y|ies)\b`, 'gi')

const caseLike = (match: string, text: string): string =>
  match === match.toUpperCase() ? text.toUpperCase() : match[0] === match[0]!.toUpperCase() ? text[0]!.toUpperCase() + text.slice(1) : text

/** Game text with the slur replaced by "fortune teller(s)", keeping its capitalisation. */
export function reword(text: string): string {
  return text.replace(SLUR, (m, end: string) => caseLike(m, end.toLowerCase() === 'ies' ? 'fortune tellers' : 'fortune teller'))
}

export const needsRewording = (text: string): boolean => new RegExp(SLUR.source, 'i').test(text)

/** A copy of an object with every string field reworded, and whether anything changed. */
export function rewordFields<T extends object>(o: T): { value: T; changed: boolean } {
  let changed = false
  const value = Object.fromEntries(Object.entries(o).map(([k, v]) => {
    if (typeof v !== 'string' || !needsRewording(v)) return [k, v]
    changed = true
    return [k, reword(v)]
  })) as T
  return { value, changed }
}
