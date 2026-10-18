import { useEffect, useMemo, useRef, useState } from 'react'
import { metKey } from '@shared/journal'
import type { Conversation } from '@parsers/talk'
import { LOCATIONS } from '@domain/constants'
import { HINTS, dialogueUnlocked } from '@domain/hints'
import { flat, intro, reply, startSim, transcript } from '@domain/talkSim'
import type { SimState } from '@domain/talkSim'
import { newClueId } from '@shared/format'
import type { Clue } from '@shared/journal'
import type { GameState } from '@shared/types'
import dialogueJson from '../../../../data/dialogue.json'
import { useJournal } from '../useJournal'

type Npc = Conversation & { position: { x: number; y: number; floor: number }; tile: number }
interface Town { locationId: number; location: string; npcs: Npc[] }

const TOWNS = dialogueJson as unknown as Town[]
const LEADS = new Set(HINTS.flatMap((h) => h.sources ?? []).map((s) => `${s.location}|${s.npc}`))

interface Sel { locationId: number; index: number }
type SaveClue = (text: string) => void

function ClueButton({ text, onSave }: { text: string; onSave: SaveClue }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(false), 1800)
    return () => clearTimeout(t)
  }, [done])
  return (
    <button className="btn small clue-btn" disabled={done} onClick={() => { onSave(text); setDone(true) }}>
      {done ? 'Saved ✓' : 'Save clue'}
    </button>
  )
}

interface Line { who: 'you' | 'npc'; text: string }

function Simulator({ npc, onSave }: { npc: Npc; onSave: SaveClue }) {
  const fresh = (): Line[] => [{ who: 'npc', text: intro(npc) }]
  const [log, setLog] = useState<Line[]>(fresh)
  const [sim, setSim] = useState<SimState>(startSim)
  const [input, setInput] = useState('')
  const end = useRef<HTMLDivElement>(null)
  // block body: newer Chromium returns a Promise from scrollIntoView, which React would treat as a cleanup
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [log])

  const send = (): void => {
    const r = reply(npc, sim, input)
    setLog((l) => [...l, { who: 'you', text: input.trim() || '(nothing)' }, ...r.lines.map((text): Line => ({ who: 'npc', text }))])
    setSim(r.state)
    setInput('')
  }
  const restart = (): void => { setLog(fresh()); setSim(startSim()); setInput('') }

  return (
    <section className="panel">
      <h3>Talk simulator</h3>
      <div className="chat">
        {log.map((l, i) => (
          <div key={i} className={`chat-line ${l.who}`}>
            <span>{l.who === 'you' ? `> ${l.text}` : l.text}</span>
            {l.who === 'npc' && <ClueButton text={l.text} onSave={onSave} />}
          </div>
        ))}
        <div ref={end} />
      </div>
      {sim.ended ? (
        <button className="btn small" onClick={restart}>Talk again</button>
      ) : (
        <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send() }}>
          <input
            value={input} onChange={(e) => setInput(e.target.value)} autoFocus
            placeholder={sim.awaitingYesNo ? 'Y or N' : 'Ask about: LOOK, NAME, JOB, HEAL, a keyword… (empty or BYE to leave)'}
          />
          <button className="btn small" type="submit">Say</button>
        </form>
      )}
      <p className="muted small">Only the first 4 letters of a word count, as in the game.</p>
    </section>
  )
}

function Transcript({ npc, onSave }: { npc: Npc; onSave: SaveClue }) {
  return (
    <section className="panel">
      <h3>Full transcript</h3>
      <ul className="clues">
        {transcript(npc).map((r) => (
          <li key={r.label}>
            <div>
              <div className="muted small">{r.label}</div>
              {r.text}
            </div>
            <ClueButton text={r.text} onSave={onSave} />
          </li>
        ))}
      </ul>
    </section>
  )
}

interface Hit { town: Town; npc: Npc; matched: string }

function search(query: string, towns: Town[]): Hit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: Hit[] = []
  for (const town of towns) {
    for (const npc of town.npcs) {
      const matched = [
        ['name', npc.name],
        ['keyword', npc.keyword1],
        ['keyword', npc.keyword2],
        ...transcript(npc).map((r): [string, string] => [r.label, r.text])
      ].find(([, text]) => flat(text!).toLowerCase().includes(q))
      if (matched) hits.push({ town, npc, matched: matched[0]! })
    }
  }
  return hits
}

export function Dialogue({ state }: { state: GameState | null }) {
  const { journal, update } = useJournal()
  const [sel, setSel] = useState<Sel | null>(null)
  const [query, setQuery] = useState('')
  const here = state?.party?.location ?? 0
  const visited = journal?.visited ?? []
  const mode = journal?.dialogueMode ?? 'visited'
  const met = new Set(journal?.met ?? [])
  const talked = (t: Town, n: Npc): boolean => met.has(metKey(t.locationId, flat(n.name)))
  const unlocked = (id: number): boolean => dialogueUnlocked(id, mode, visited)

  const hits = useMemo(() => search(query, TOWNS.filter((t) => dialogueUnlocked(t.locationId, mode, visited))), [query, mode, visited])

  if (!journal) return <><h2>Dialogue</h2><p className="muted">Loading…</p></>

  // until the player picks one, open on the settlement the party is in
  const hereTown = TOWNS.find((t) => t.locationId === here)
  const current: Sel | null = sel ?? (hereTown && unlocked(here) ? { locationId: here, index: hereTown.npcs[0]?.index ?? 0 } : null)
  const town = current && unlocked(current.locationId) ? TOWNS.find((t) => t.locationId === current.locationId) : undefined
  const npc = town?.npcs.find((n) => n.index === current?.index)
  const showLeads = journal.spoilerLevel !== 'off'

  const toggleAll = (on: boolean): void => {
    if (on && !window.confirm('Reveal every town\'s dialogue, including towns you have not visited yet? This can spoil quest clues.')) return
    update((j) => ({ ...j, dialogueMode: on ? 'all' : 'visited' }))
  }

  const saveClue: SaveClue = (text) => {
    if (!npc || !town) return
    const clue: Clue = {
      id: newClueId(Date.now(), Math.random()), text, source: flat(npc.name), location: town.location, createdAt: Date.now()
    }
    update((j) => ({ ...j, clues: [clue, ...j.clues] }))
  }

  const lead = (t: Town, n: Npc): boolean => showLeads && LEADS.has(`${t.location}|${n.name}`)

  return (
    <>
      <h2>Dialogue</h2>
      <div className="toolbar">
        <input
          className="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search unlocked towns: names, keywords, anything said"
        />
        <label className="check">
          <input type="checkbox" checked={mode === 'all'} onChange={(e) => toggleAll(e.target.checked)} /> Reveal all towns
        </label>
      </div>

      {query.trim() && (
        <section className="panel">
          <h3>Search results ({hits.length})</h3>
          {hits.length === 0 ? <p className="muted small">Nothing found in the towns you can see.</p> : (
            <ul className="results">
              {hits.slice(0, 60).map((h) => (
                <li key={`${h.town.locationId}-${h.npc.index}`}>
                  <button className="link" onClick={() => { setSel({ locationId: h.town.locationId, index: h.npc.index }); setQuery('') }}>
                    {flat(h.npc.name)} <span className="muted">in {h.town.location}</span>
                  </button>
                  <span className="muted small"> matched {h.matched}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="dialogue">
        <nav className="panel towns">
          <h3>Settlements</h3>
          {TOWNS.map((t) => {
            const ok = unlocked(t.locationId)
            return (
              <button
                key={t.locationId} disabled={!ok}
                className={`town${current?.locationId === t.locationId ? ' active' : ''}`}
                onClick={() => setSel({ locationId: t.locationId, index: t.npcs[0]?.index ?? 0 })}
              >
                <span>{t.location}{t.locationId === here && <span className="here"> ● you are here</span>}</span>
                {!ok && <span className="muted small">Not visited yet</span>}
                {ok && t.npcs.some((n) => talked(t, n)) && (
                  <span className="muted small">Talked to {t.npcs.filter((n) => talked(t, n)).length} of {t.npcs.length}</span>
                )}
              </button>
            )
          })}
          {mode === 'visited' && <p className="muted small">Towns unlock once you have been inside them.</p>}
        </nav>

        <div className="dialogue-main">
          {!town ? (
            <p className="muted">Choose a settlement to read its people.</p>
          ) : (
            <>
              <section className="panel">
                <h3>{town.location}</h3>
                <div className="cards">
                  {town.npcs.map((n) => (
                    <button
                      key={n.index} className={`card npc${n.index === npc?.index ? ' selected' : ''}`}
                      onClick={() => setSel({ locationId: town.locationId, index: n.index })}
                    >
                      <div className="card-head">
                        <b>{flat(n.name)}</b>
                        {lead(town, n) && <span className="lead" title="Gives a clue for a hint topic">★ quest lead</span>}
                        {talked(town, n) && <span className="talked" title="You have talked to this person">✓ talked</span>}
                      </div>
                      <div className="muted small">{flat(n.description)}</div>
                      <div className="small">{flat(n.job)}</div>
                    </button>
                  ))}
                </div>
              </section>
              {npc && (
                <div className="grid">
                  <Simulator key={`${town.locationId}-${npc.index}`} npc={npc} onSave={saveClue} />
                  <Transcript key={`t${town.locationId}-${npc.index}`} npc={npc} onSave={saveClue} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
