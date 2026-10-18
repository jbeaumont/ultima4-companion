// Human-readable list of what an edit changes, shown in the confirmation dialog.
import type { PartySave } from '@parsers/party'

const SKIP = new Set(['members', 'counter'])

export function describeChanges(before: PartySave, after: PartySave): string[] {
  const out: string[] = []
  const walk = (path: string, a: unknown, b: unknown): void => {
    if (out.length >= 40) return
    if (Array.isArray(a) && Array.isArray(b)) {
      a.forEach((v, i) => walk(`${path}[${i}]`, v, b[i]))
    } else if (a && b && typeof a === 'object' && typeof b === 'object') {
      for (const k of Object.keys(a)) walk(path ? `${path}.${k}` : k, (a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
    } else if (a !== b) {
      out.push(`${path}: ${String(a)} → ${String(b)}`)
    }
  }
  for (const k of Object.keys(before) as (keyof PartySave)[]) {
    if (!SKIP.has(k)) walk(k, before[k], after[k])
  }
  return out
}
