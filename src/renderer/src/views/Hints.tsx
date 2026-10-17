import { useState } from 'react'
import { HINTS, canReveal, isSolved, suggestedTopics, visibleTiers } from '@domain/hints'
import type { HintCategory, HintTopic, SpoilerLevel } from '@domain/hints'
import { progress } from '@domain/progress'
import type { Progress } from '@domain/progress'
import { flat } from '@domain/talkSim'
import type { GameState } from '@shared/types'
import { useJournal } from '../useJournal'

const CATEGORIES: { id: HintCategory; title: string }[] = [
  { id: 'basics', title: 'Basics' },
  { id: 'runes', title: 'Runes' },
  { id: 'mantras', title: 'Mantras' },
  { id: 'stones', title: 'Stones' },
  { id: 'items', title: 'Items' },
  { id: 'altars', title: 'Altars' },
  { id: 'abyss', title: 'The Abyss' }
]

const LEVELS: { id: SpoilerLevel; label: string; blurb: string }[] = [
  { id: 'off', label: 'Off', blurb: 'No hint text at all: just topic titles and whether you have solved them.' },
  { id: 'nudges', label: 'Nudges only', blurb: 'You may reveal the gentle first nudge for each topic, never the clue or the answer.' },
  { id: 'full', label: 'Full', blurb: 'You may reveal nudge, then clue, then the full answer, one click at a time.' }
]

const TIER_LABELS = ['Nudge', 'Clue', 'Answer']

interface CardProps {
  topic: HintTopic
  level: SpoilerLevel
  revealed: number
  solved: boolean
  onReveal: (n: number) => void
}

function TopicCard({ topic, level, revealed, solved, onReveal }: CardProps) {
  const tiers = visibleTiers(topic, level, revealed)
  const sources = topic.sources ?? []
  return (
    <div className="card hint">
      <div className="card-head">
        <b>{topic.title}</b>
        {solved && <span className="status s-G">Solved</span>}
      </div>
      {tiers.map((t, i) => (
        <div key={i} className="tier">
          <span className="tier-label">{TIER_LABELS[i]}</span> {t}
        </div>
      ))}
      {tiers.length >= 2 && sources.length > 0 && (
        <div className="small muted">
          Who to ask: {sources.map((s) => `${flat(s.npc)} (${s.location})`).join(', ')}
        </div>
      )}
      <div className="hint-actions">
        {canReveal(level, revealed) && (
          <button className="btn small" onClick={() => onReveal(revealed + 1)}>Reveal next</button>
        )}
        {tiers.length > 0 && <button className="btn small" onClick={() => onReveal(0)}>Hide again</button>}
      </div>
    </div>
  )
}

export function Hints({ state }: { state: GameState | null }) {
  const { journal, update } = useJournal()
  const [hideSolved, setHideSolved] = useState(false)
  const [onlyHere, setOnlyHere] = useState(false)
  const party = state?.party ?? null
  if (!journal) return <><h2>Hints</h2><p className="muted">Loading…</p></>

  const level = journal.spoilerLevel
  const pr: Progress | null = party ? progress(party) : null
  const here = party?.location ?? 0
  const setReveal = (id: string, n: number): void => update((j) => ({ ...j, revealed: { ...j.revealed, [id]: n } }))
  const solvedOf = (t: HintTopic): boolean => isSolved(t, pr)
  const suggested = suggestedTopics(pr, here).slice(0, 5)

  const card = (t: HintTopic) => (
    <TopicCard
      key={t.id} topic={t} level={level} revealed={journal.revealed[t.id] ?? 0}
      solved={solvedOf(t)} onReveal={(n) => setReveal(t.id, n)}
    />
  )

  return (
    <>
      <h2>Hints</h2>
      <section className="panel">
        <h3>Spoiler level</h3>
        <div className="toolbar">
          {LEVELS.map((l) => (
            <button
              key={l.id} className={`btn small${l.id === level ? ' active' : ''}`}
              onClick={() => update((j) => ({ ...j, spoilerLevel: l.id }))}
            >
              {l.label}
            </button>
          ))}
        </div>
        <p className="muted small">{LEVELS.find((l) => l.id === level)?.blurb}</p>
        {level === 'off' && <p className="note">Spoilers are off: only titles and solved state are shown. Pick a higher level above to reveal hints.</p>}
        {!party && <p className="muted small">No party yet, so nothing can be marked solved.</p>}
      </section>

      {suggested.length > 0 && (
        <section className="panel">
          <h3>Suggested next</h3>
          <div className="cards">{suggested.map(card)}</div>
        </section>
      )}

      <div className="toolbar hint-filters">
        <label className="check">
          <input type="checkbox" checked={hideSolved} onChange={(e) => setHideSolved(e.target.checked)} /> Hide solved
        </label>
        <label className="check">
          <input type="checkbox" checked={onlyHere} disabled={!here} onChange={(e) => setOnlyHere(e.target.checked)} /> Only relevant here
        </label>
      </div>

      {CATEGORIES.map((c) => {
        const topics = HINTS.filter((t) => t.category === c.id)
          .filter((t) => !(hideSolved && solvedOf(t)))
          .filter((t) => !(onlyHere && here && !t.relevantAt?.includes(here)))
        if (topics.length === 0) return null
        return (
          <section key={c.id} className="panel">
            <h3>{c.title}</h3>
            <div className="cards">{topics.map(card)}</div>
          </section>
        )
      })}
    </>
  )
}
