import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { PERSONAS } from '../../../main/sage/prompt'
import type { Persona } from '../../../main/sage/prompt'
import type { SpoilerLevel } from '@domain/hints'
import { addQuestion, applyDelta, applyDone, bindRequest, failPending, isAnswering, mentionsApiKey } from '../sageTranscript'
import type { DoneEvent, SageMsg } from '../sageTranscript'
import { useJournal } from '../useJournal'

const LEVEL_LABELS: Record<SpoilerLevel, string> = { off: 'Off', nudges: 'Nudges only', full: 'Full' }

const STARTERS = [
  'How close am I to Avatarhood?',
  'What should I do next?',
  'What do the moons mean right now?',
  'Where should I go to learn about the rune of Honesty?'
]

type Early = { kind: 'delta'; id: string; text: string } | { kind: 'done'; e: DoneEvent }

interface Props {
  onNavigate: (v: 'Hints' | 'Settings') => void
}

export function Sage({ onNavigate }: Props) {
  const { journal } = useJournal()
  const [persona, setPersona] = useState<Persona>('hawkwind')
  const [msgs, setMsgs] = useState<SageMsg[]>([])
  const [draft, setDraft] = useState('')
  const [model, setModel] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // request bookkeeping: events can arrive before sageAsk resolves with its id
  const bound = useRef<string | null>(null)
  const asking = useRef(false)
  const early = useRef<Early[]>([])
  const gen = useRef(0)
  const lastLevel = useRef<SpoilerLevel | null>(null)

  const level = journal?.spoilerLevel ?? null
  const answering = isAnswering(msgs)

  useEffect(() => {
    window.u4.sageStatus().then((s) => setModel(s.model), () => undefined)
  }, [])

  useEffect(() => {
    const offDelta = window.u4.onSageDelta((e) => {
      if (bound.current === e.id) setMsgs((m) => applyDelta(m, e.id, e.text))
      else if (asking.current) early.current.push({ kind: 'delta', id: e.id, text: e.text })
    })
    const offDone = window.u4.onSageDone((e) => {
      if (bound.current === e.id) {
        bound.current = null
        setMsgs((m) => applyDone(m, e))
      } else if (asking.current) early.current.push({ kind: 'done', e })
    })
    return () => {
      offDelta()
      offDone()
    }
  }, [])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs])

  const clear = (): void => {
    gen.current++
    bound.current = null
    asking.current = false
    early.current = []
    lastLevel.current = null
    setMsgs([])
    void window.u4.sageReset()
  }

  const send = async (text: string): Promise<void> => {
    const q = text.trim()
    if (!q || answering || !level) return
    const changed = lastLevel.current !== null && lastLevel.current !== level
    lastLevel.current = level
    const g = gen.current
    asking.current = true
    early.current = []
    setDraft('')
    setMsgs((m) => addQuestion(m, q, changed))
    try {
      const id = await window.u4.sageAsk(q, persona)
      if (g !== gen.current) return
      const buffered = early.current
      early.current = []
      asking.current = false
      const finished = buffered.some((x) => x.kind === 'done' && x.e.id === id)
      bound.current = finished ? null : id
      setMsgs((m) => {
        let out = bindRequest(m, id)
        for (const x of buffered) {
          if (x.kind === 'delta' && x.id === id) out = applyDelta(out, id, x.text)
          else if (x.kind === 'done' && x.e.id === id) out = applyDone(out, x.e)
        }
        return out
      })
    } catch (err) {
      if (g !== gen.current) return
      asking.current = false
      early.current = []
      setMsgs((m) => failPending(m, `Could not ask the sage: ${err instanceof Error ? err.message : String(err)}`))
    }
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send(draft)
    }
  }

  const changePersona = (p: Persona): void => {
    setPersona(p)
    clear()
  }

  return (
    <div className="sage">
      <h2>Sage</h2>
      <section className="panel sage-head">
        <div className="toolbar">
          <label>
            Advisor{' '}
            <select value={persona} onChange={(e) => changePersona(e.target.value as Persona)}>
              {(Object.keys(PERSONAS) as Persona[]).map((p) => (
                <option key={p} value={p}>{PERSONAS[p].name}</option>
              ))}
            </select>
          </label>
          <span className="muted small">
            Spoiler level: {level ? LEVEL_LABELS[level] : '…'}{' '}
            <button className="linklike" onClick={() => onNavigate('Hints')}>Change in Hints</button>
          </span>
          <button className="btn small" onClick={clear}>New conversation</button>
        </div>
      </section>

      <div className="sage-list" ref={listRef}>
        {msgs.length === 0 && (
          <div className="sage-empty">
            <p className="muted">Ask {PERSONAS[persona].name} for guidance on your quest.</p>
            <div className="sage-chips">
              {STARTERS.map((s) => (
                <button key={s} className="chip" disabled={!level} onClick={() => void send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m) =>
          m.role === 'system' ? (
            <div key={m.key} className="sage-msg system muted small">
              {m.text}
              {mentionsApiKey(m.text) && (
                <> <button className="btn small" onClick={() => onNavigate('Settings')}>Go to Settings</button></>
              )}
            </div>
          ) : (
            <div key={m.key} className={`sage-msg ${m.role}`}>
              <div className="sage-who small muted">{m.role === 'user' ? 'You' : PERSONAS[persona].name}</div>
              {m.text || (m.pending ? <span className="muted">The sage ponders…</span> : null)}
            </div>
          )
        )}
      </div>

      <div className="sage-input">
        <textarea
          value={draft} rows={2} placeholder="Ask the sage… (Enter to send, Shift+Enter for a new line)"
          onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey}
        />
        <div className="sage-actions">
          <button className="btn primary" disabled={answering || !draft.trim() || !level} onClick={() => void send(draft)}>Send</button>
          {answering && <button className="btn" onClick={() => void window.u4.sageCancel()}>Stop</button>}
        </div>
      </div>
      <p className="muted small">
        {model ? `Model: ${model}. ` : ''}With hints off the sage gives fixed, spoiler-free counsel and sends nothing to the API. At Nudges or Full its answers are generated from your game state and the hint tiers that level allows; it is told not to say more, but that is best effort, not a guarantee. Requests are billed to your Anthropic API account.
      </p>
    </div>
  )
}
