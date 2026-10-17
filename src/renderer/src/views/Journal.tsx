import { useEffect, useRef, useState } from 'react'
import type { PartySave } from '@parsers/party'
import { cooldowns } from '@domain/cooldowns'
import { MOONGATES, PHASE_NAMES, SPIRITUALITY_RUNE, gateState, stepsUntilRoute, upcomingGates } from '@domain/moongates'
import { progress } from '@domain/progress'
import type { ChecklistItem } from '@domain/progress'
import { emptyJournal } from '@shared/journal'
import type { Clue, Journal } from '@shared/journal'
import { newClueId, routeLabel, timerLabel } from '@shared/format'
import type { GameState } from '@shared/types'
import { VirtueRow } from '../components/VirtueRow'

const GROUPS: { id: ChecklistItem['group']; title: string }[] = [
  { id: 'virtues', title: 'Partial Avatarhood' },
  { id: 'runes', title: 'Runes' },
  { id: 'stones', title: 'Stones' },
  { id: 'items', title: 'Items' },
  { id: 'abyss', title: 'At the Abyss' }
]

const phase = (n: number) => `${PHASE_NAMES[n & 7]} (${n})`

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function Header({ p }: { p: PartySave }) {
  const pr = progress(p)
  return (
    <section className="panel journal-head">
      <div className="kv big">
        <span><b>{pr.requiredDone} / {pr.requiredTotal}</b> required steps</span>
        <span><b>{pr.avatarCount}</b> of 8 partial Avatarhoods</span>
      </div>
      {pr.abyssReady && <div className="banner">☥ Abyss ready: everything needed to descend is in hand.</div>}
    </section>
  )
}

function Virtues({ p }: { p: PartySave }) {
  return (
    <Section title="Virtues">
      {progress(p).virtues.map((v) => <VirtueRow key={v.virtue} name={v.virtue} karma={v.karma} rune={v.rune} />)}
    </Section>
  )
}

function Checklist({ p }: { p: PartySave }) {
  const items = progress(p).checklist
  return (
    <Section title="Checklist">
      {GROUPS.map((g) => {
        const list = items.filter((c) => c.group === g.id)
        const done = list.filter((c) => c.done).length
        return (
          <details key={g.id} className="group" open>
            <summary>{g.title} <span className="muted small">{done}/{list.length}</span></summary>
            <ul className="checklist">
              {list.map((c) => (
                <li key={c.id} className={`${c.done ? 'done' : ''}${c.required ? '' : ' helpful'}`}>
                  <span className="tick">{c.done ? '✓' : '○'}</span> {c.label}
                  {!c.required && <span className="tag">helpful</span>}
                </li>
              ))}
            </ul>
          </details>
        )
      })}
    </Section>
  )
}

function Timers({ p }: { p: PartySave }) {
  const c = cooldowns(p)
  const row = (name: string, t: { ready: boolean; movesLeft: number }, extra?: React.ReactNode) => (
    <div className="timer-row">
      <span>{name}</span>
      <b className={t.ready ? 'ready' : 'wait'}>{timerLabel(t)}</b>
      {extra}
    </div>
  )
  return (
    <Section title="Timers">
      {row('Camp', c.camp)}
      {row('Meditation', c.meditation)}
      {row('Virtue conversation', c.virtue)}
      {row('Mandrake / Nightshade', c.reagent.canSearch ? { ready: true, movesLeft: 0 } : c.reagent, (
        <span className="muted small">
          moons {c.reagent.newMoons ? 'new' : 'not new'} · timer {c.reagent.ready ? 'ready' : 'waiting'} ·{' '}
          {c.reagent.canSearch ? 'can search now' : 'cannot search yet'}
        </span>
      ))}
      <p className="muted small">As of the last save: the game only writes PARTY.SAV on Quit &amp; Save.</p>
    </Section>
  )
}

function Moongates({ p }: { p: PartySave }) {
  const [from, setFrom] = useState(0)
  const [to, setTo] = useState(1)
  const g = gateState(p.trammel, p.felucca)
  const hasRune = (p.runes & (1 << SPIRITUALITY_RUNE)) !== 0
  const next = upcomingGates(p.trammel, p.felucca, 8)
  const gateSelect = (v: number, set: (n: number) => void) => (
    <select value={v} onChange={(e) => set(Number(e.target.value))}>
      {MOONGATES.map((m) => <option key={m.phase} value={m.phase}>{m.near} ({PHASE_NAMES[m.phase]})</option>)}
    </select>
  )
  return (
    <Section title="Moongates">
      <div className="kv big">
        <span>Trammel <b>{phase(p.trammel)}</b></span>
        <span>Felucca <b>{phase(p.felucca)}</b></span>
      </div>
      <p>
        Open gate: near <b>{g.open.near}</b> ({g.open.x},{g.open.y}) → leads to <b>{g.destination.near}</b>
      </p>
      {g.spirituality && (
        <p className="note">
          This gate leads to the Shrine of Spirituality.{' '}
          {hasRune ? 'You already have the Rune of Spirituality.' : 'You do not have the Rune of Spirituality yet.'}
        </p>
      )}
      <h4>Next gates</h4>
      <table className="gates">
        <thead><tr><th>When</th><th>Trammel</th><th>Felucca</th><th>Gate near</th><th>Leads to</th></tr></thead>
        <tbody>
          {next.map((n) => (
            <tr key={n.stepsAhead}>
              <td>{routeLabel(n.stepsAhead)}</td>
              <td>{phase(n.trammel)}</td>
              <td>{phase(n.felucca)}</td>
              <td>{n.open.near}</td>
              <td>{n.spirituality ? 'Shrine of Spirituality' : n.destination.near}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">A phase change is one step of the moon cycle; how long it takes depends on how you play.</p>
      <h4>Route finder</h4>
      <div className="toolbar">
        <label>From {gateSelect(from, setFrom)}</label>
        <label>To {gateSelect(to, setTo)}</label>
        <b>{routeLabel(stepsUntilRoute(p.trammel, p.felucca, from, to))}</b>
      </div>
    </Section>
  )
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function useJournal() {
  const [journal, setJournal] = useState<Journal | null>(null)
  const [save, setSave] = useState<SaveState>('idle')
  const latest = useRef<Journal>(emptyJournal())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = (): void => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setSave('saving')
    window.u4.saveJournal(latest.current).then(() => setSave('saved'), () => setSave('error'))
  }
  const update = (next: Journal, delay: number): void => {
    latest.current = next
    setJournal(next)
    setSave('saving')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, delay)
  }

  useEffect(() => {
    let live = true
    window.u4.getJournal().then((j) => {
      if (!live) return
      latest.current = j
      setJournal(j)
    }, () => live && setJournal(emptyJournal()))
    return () => {
      live = false
      if (timer.current) {
        clearTimeout(timer.current)
        void window.u4.saveJournal(latest.current) // unsent edit
      }
    }
  }, [])
  return { journal, save, update }
}

function Notes({ journal, save, update }: ReturnType<typeof useJournal> & { journal: Journal }) {
  const label = { idle: '', saving: 'Saving…', saved: 'Saved', error: 'Save failed' }[save]
  return (
    <Section title="Notes">
      <textarea
        className="notes" rows={8} placeholder="Free-form notes…" value={journal.notes}
        onChange={(e) => update({ ...journal, notes: e.target.value }, 500)}
      />
      <div className={`small ${save === 'error' ? 'bad' : 'muted'}`}>{label}</div>
    </Section>
  )
}

function Clues({ journal, update }: Pick<ReturnType<typeof useJournal>, 'update'> & { journal: Journal }) {
  const [text, setText] = useState('')
  const [source, setSource] = useState('')
  const [location, setLocation] = useState('')
  const add = (): void => {
    const t = text.trim()
    if (!t) return
    const clue: Clue = { id: newClueId(Date.now(), Math.random()), text: t, createdAt: Date.now() }
    if (source.trim()) clue.source = source.trim()
    if (location.trim()) clue.location = location.trim()
    update({ ...journal, clues: [clue, ...journal.clues] }, 0)
    setText('')
    setSource('')
    setLocation('')
  }
  return (
    <Section title="Clues">
      <form className="clue-form" onSubmit={(e) => { e.preventDefault(); add() }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Clue" />
        <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source (optional)" />
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" />
        <button className="btn small" type="submit" disabled={!text.trim()}>Add</button>
      </form>
      {journal.clues.length === 0 ? <p className="muted small">No clues yet.</p> : (
        <ul className="clues">
          {journal.clues.map((c) => (
            <li key={c.id}>
              <div>
                {c.text}
                {(c.source || c.location) && (
                  <div className="muted small">{[c.source, c.location].filter(Boolean).join(' · ')}</div>
                )}
              </div>
              <button className="btn small" onClick={() => update({ ...journal, clues: journal.clues.filter((x) => x.id !== c.id) }, 0)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

export function JournalView({ state }: { state: GameState | null }) {
  const p = state?.party ?? null
  const j = useJournal()
  return (
    <>
      <h2>Journal</h2>
      {p ? (
        <div className="journal">
          <Header p={p} />
          <div className="grid">
            <Virtues p={p} />
            <Timers p={p} />
            <Checklist p={p} />
            <Moongates p={p} />
          </div>
        </div>
      ) : (
        <p className="muted">No party yet: progress, timers and moongates appear once a save file is found. Notes and clues still work below.</p>
      )}
      {j.journal ? (
        <div className="grid journal-notes">
          <Notes {...j} journal={j.journal} />
          <Clues journal={j.journal} update={j.update} />
        </div>
      ) : (
        <p className="muted">Loading journal…</p>
      )}
    </>
  )
}
