import { useEffect, useState } from 'react'
import type { CharacterRecord, PartySave } from '@parsers/party'
import {
  ARMOR, CLASSES, ITEM_FLAGS, LOCATIONS, REAGENTS, RUNES, SPELLS, STATUS, STONES, VIRTUES, WEAPONS,
  describeTransport
} from '@domain/constants'
import type { ItemName } from '@domain/constants'
import { canSaveHere } from '@domain/unsaved'
import { unsavedChip } from '@domain/unsavedChip'
import type { GameState } from '@shared/types'
import { sourceLabel } from '@shared/observationLabel'

import { VirtueRow } from '../components/VirtueRow'

const STONE_COLORS: Record<string, string> = {
  Blue: '#3b6fd9', Yellow: '#e6c53a', Red: '#d94a3b', Green: '#3fa85a',
  Orange: '#e48a2c', Purple: '#8a4fc7', White: '#ecece6', Black: '#2a2a33'
}
const ITEM_LABELS: Record<ItemName, string> = {
  skull: 'Skull of Mondain', skullDestroyed: 'Skull destroyed', candle: 'Candle', book: 'Book',
  bell: 'Bell', keyC: 'Key of Courage', keyL: 'Key of Love', keyT: 'Key of Truth',
  horn: 'Horn', wheel: 'Wheel', candleUsed: 'Candle used', bookUsed: 'Book used', bellUsed: 'Bell used'
}

const pct = (v: number, max: number) => `${max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0}%`
const label = <T extends readonly string[]>(list: T, i: number) => list[i] ?? `#${i}`

function Bar({ value, max, cls = '' }: { value: number; max: number; cls?: string }) {
  return (
    <div className="bar">
      <div className={`fill ${cls}`} style={{ width: pct(value, max) }} />
    </div>
  )
}

function Badge({ on, children, color }: { on: boolean; children: React.ReactNode; color?: string }) {
  return (
    <span className={`badge ${on ? 'on' : 'off'}`} style={on && color ? { borderColor: color, color } : undefined}>
      {color && <i className="chip" style={{ background: on ? color : 'transparent', borderColor: color }} />}
      {children}
    </span>
  )
}

function Panel({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`panel${wide ? ' wide' : ''}`}>
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function MemberCard({ m }: { m: CharacterRecord }) {
  const level = Math.floor(m.hpMax / 100)
  const statusName = STATUS[m.status as keyof typeof STATUS] ?? m.status
  return (
    <div className="card">
      <div className="card-head">
        <strong>{m.name || '(unnamed)'}</strong>
        <span className={`status s-${m.status}`}>{statusName}</span>
      </div>
      <div className="muted small">
        {label(CLASSES, m.classIndex)} · {m.sex} · Level {level}
      </div>
      <div className="stat-row"><span>HP</span><Bar value={m.hp} max={m.hpMax} cls="hp" /><span>{m.hp}/{m.hpMax}</span></div>
      <div className="kv">
        <span>MP <b>{m.mp}</b></span>
        <span>XP <b>{m.xp}</b></span>
        <span>STR <b>{m.str}</b></span>
        <span>DEX <b>{m.dex}</b></span>
        <span>INT <b>{m.int}</b></span>
      </div>
      <div className="small">{label(WEAPONS, m.weapon)} · {label(ARMOR, m.armor)}</div>
    </div>
  )
}

function Party({ p }: { p: PartySave }) {
  const members = p.memberCount === 0 ? p.allRecords.slice(0, 1) : p.members
  return (
    <Panel title="Party" wide>
      <div className="cards">{members.map((m, i) => <MemberCard key={i} m={m} />)}</div>
    </Panel>
  )
}

function Virtues({ p }: { p: PartySave }) {
  return (
    <Panel title="Virtues">
      {VIRTUES.map((v, i) => <VirtueRow key={v} name={v} karma={p.karma[i] ?? 0} />)}
    </Panel>
  )
}

function Collection({ p }: { p: PartySave }) {
  return (
    <Panel title="Runes, Stones & Quest items">
      <h4>Runes</h4>
      <div className="badges">
        {RUNES.map((r, i) => <Badge key={r} on={(p.runes & (1 << i)) !== 0}>{r}</Badge>)}
      </div>
      <h4>Stones</h4>
      <div className="badges">
        {STONES.map((s, i) => <Badge key={s} on={(p.stones & (1 << i)) !== 0} color={STONE_COLORS[s]}>{s}</Badge>)}
      </div>
      <h4>Quest items</h4>
      <div className="badges">
        {(Object.keys(ITEM_FLAGS) as ItemName[]).map((k) => (
          <Badge key={k} on={(p.items & ITEM_FLAGS[k]) !== 0}>{ITEM_LABELS[k]}</Badge>
        ))}
      </div>
    </Panel>
  )
}

function Supplies({ p }: { p: PartySave }) {
  const reagents = REAGENTS.map((n, i) => [n, p.reagents[i] ?? 0] as const).filter(([, c]) => c > 0)
  const mixtures = SPELLS.map((n, i) => [n, p.mixtures[i] ?? 0] as const).filter(([, c]) => c > 0)
  return (
    <Panel title="Supplies">
      <div className="kv big">
        <span>Gold <b>{p.gold}</b></span>
        <span>Food <b>{Math.floor(p.food / 100)}</b></span>
        <span>Torches <b>{p.torches}</b></span>
        <span>Gems <b>{p.gems}</b></span>
        <span>Keys <b>{p.keys}</b></span>
        <span>Sextants <b>{p.sextants}</b></span>
      </div>
      <h4>Reagents</h4>
      {reagents.length === 0 ? <p className="muted small">None</p> : (
        <div className="kv">{reagents.map(([n, c]) => <span key={n}>{n} <b>{c}</b></span>)}</div>
      )}
      <h4>Mixtures</h4>
      {mixtures.length === 0 ? <p className="muted small">None</p> : (
        <div className="kv">{mixtures.map(([n, c]) => <span key={n}>{n} <b>{c}</b></span>)}</div>
      )}
    </Panel>
  )
}

function Position({ p }: { p: PartySave }) {
  const loc = p.location === 0 ? 'Britannia' : LOCATIONS[p.location]?.name ?? `Unknown (${p.location})`
  const underground = p.dungeonLevel !== 0xffff
  return (
    <Panel title="Position">
      <div className="kv big">
        <span>Location <b>{loc}</b></span>
        <span>X,Y <b>{p.x}, {p.y}</b></span>
        <span>Transport <b>{describeTransport(p.transport)}</b></span>
        {underground && <span>Dungeon level <b>{p.dungeonLevel + 1}</b></span>}
        <span>Trammel <b>{p.trammel}</b>/7</span>
        <span>Felucca <b>{p.felucca}</b>/7</span>
        <span>Moves <b>{p.moves}</b></span>
      </div>
    </Panel>
  )
}

function StatusBar({ state }: { state: GameState | null }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const age = state?.updatedAt ? Math.max(0, Math.round((now - state.updatedAt) / 1000)) : null
  const chip = state?.party ? unsavedChip(state.unsavedMoves, canSaveHere(state.party)) : null
  const msg = !state ? 'Loading…' : state.status === 'ok' ? null : state.message ?? state.status
  return (
    <div className={`statusbar ${state?.status ?? ''}`}>
      {state && (
        <span className={`source-badge ${state.source === 'memory' ? 'live' : ''}`}>
          {sourceLabel(state, Date.now()).text}
        </span>
      )}
      <span className="path">{state?.savePath ?? state?.gameDir ?? 'No save file'}</span>
      {chip && (
        <span className={`unsaved-chip ${chip.level}`}>
          {chip.text}
          <span className="unsaved-hint"> · {chip.hint.split(' · ')[1]}</span>
        </span>
      )}
      {age !== null && <span>updated {age} s ago</span>}
      {msg && <span className="msg">{msg}</span>}
    </div>
  )
}

export function Tracker({ state }: { state: GameState | null }) {
  const p = state?.party ?? null
  return (
    <>
      <h2>Tracker</h2>
      <StatusBar state={state} />
      {p ? (
        <div className="grid">
          <Party p={p} />
          <Virtues p={p} />
          <Collection p={p} />
          <Supplies p={p} />
          <Position p={p} />
        </div>
      ) : (
        <p className="muted">Waiting for a save file…</p>
      )}
    </>
  )
}
