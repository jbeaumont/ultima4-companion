// Pure transcript logic for the Sage view (no DOM), so it can be tested.
export interface SageMsg {
  key: string
  role: 'user' | 'sage' | 'system'
  text: string
  /** main's request id; null until sageAsk resolves */
  reqId: string | null
  pending: boolean
}

export type DoneEvent = { id: string } & ({ ok: true } | { ok: false; message: string })

export const LEVEL_CHANGED_NOTE = '(Spoiler level changed. The sage has forgotten the earlier conversation.)'

let seq = 0
export const msgKey = (): string => `m${++seq}`

/** A question plus the empty sage reply that streams into it. */
export function addQuestion(msgs: SageMsg[], text: string, levelChanged: boolean): SageMsg[] {
  const out = [...msgs]
  if (levelChanged) out.push({ key: msgKey(), role: 'system', text: LEVEL_CHANGED_NOTE, reqId: null, pending: false })
  out.push({ key: msgKey(), role: 'user', text, reqId: null, pending: false })
  out.push({ key: msgKey(), role: 'sage', text: '', reqId: null, pending: true })
  return out
}

/** Attach the request id to the pending sage reply (once). */
export function bindRequest(msgs: SageMsg[], id: string): SageMsg[] {
  return msgs.map((m) => (m.role === 'sage' && m.pending && m.reqId === null ? { ...m, reqId: id } : m))
}

export function applyDelta(msgs: SageMsg[], id: string, text: string): SageMsg[] {
  return msgs.map((m) => (m.role === 'sage' && m.reqId === id ? { ...m, text: m.text + text } : m))
}

/** Finish a reply; a failure adds a system line (and drops an empty reply). */
export function applyDone(msgs: SageMsg[], e: DoneEvent): SageMsg[] {
  const idx = msgs.findIndex((m) => m.role === 'sage' && m.reqId === e.id)
  if (idx < 0) return msgs
  const out = [...msgs]
  const cur = out[idx]!
  if (e.ok) {
    out[idx] = { ...cur, pending: false }
    return out
  }
  if (cur.text) out[idx] = { ...cur, pending: false }
  else out.splice(idx, 1)
  out.splice(idx + (cur.text ? 1 : 0), 0, { key: msgKey(), role: 'system', text: e.message, reqId: null, pending: false })
  return out
}

/** Finish a reply whose request never started (sageAsk itself failed). */
export function failPending(msgs: SageMsg[], message: string): SageMsg[] {
  const idx = msgs.findIndex((m) => m.role === 'sage' && m.pending && m.reqId === null)
  if (idx < 0) return msgs
  const out = [...msgs]
  out.splice(idx, 1, { key: msgKey(), role: 'system', text: message, reqId: null, pending: false })
  return out
}

export const mentionsApiKey = (message: string): boolean => /api key/i.test(message)

export const isAnswering = (msgs: SageMsg[]): boolean => msgs.some((m) => m.role === 'sage' && m.pending)
