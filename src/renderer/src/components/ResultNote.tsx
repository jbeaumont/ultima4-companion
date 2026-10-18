// Inline outcome of a save operation: ok, refused/failed (verbatim) or a neutral "Cancelled."
export type Outcome = { kind: 'ok' | 'error' | 'cancelled'; text: string }

export function outcomeOf(r: { ok: true } | { ok: false; message: string; cancelled?: true }, okText: string): Outcome {
  if (r.ok) return { kind: 'ok', text: okText }
  return { kind: r.cancelled ? 'cancelled' : 'error', text: r.message }
}

export function ResultNote({ o }: { o: Outcome | null | undefined }) {
  if (!o) return null
  return <span className={`result ${o.kind}`} role={o.kind === 'error' ? 'alert' : 'status'}>{o.text}</span>
}
