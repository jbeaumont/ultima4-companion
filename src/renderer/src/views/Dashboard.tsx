import type { PartySave } from '@parsers/party'
import { CLASSES, ITEM_FLAGS, LOCATIONS, STATUS, STONES, VIRTUES } from '@domain/constants'
import type { ItemName } from '@domain/constants'
import { COMPANIONS, STATUS_TEXT, companionStatus } from '@domain/companions'
import { cooldowns } from '@domain/cooldowns'
import { suggestedTopics } from '@domain/hints'
import { PHASE_NAMES, gateState } from '@domain/moongates'
import { progress } from '@domain/progress'
import { canSaveHere } from '@domain/unsaved'
import { unsavedChip } from '@domain/unsavedChip'
import { timerLabel } from '@shared/format'
import type { GameState } from '@shared/types'
import { useDashboardArt } from '../useDashboardArt'
import type { DashboardArt } from '../useDashboardArt'
import { useJournal } from '../useJournal'

// the black stone is drawn as dark slate so it stays visible on the dark theme
const STONE_COLORS = ['#3b6fd9', '#e6c53a', '#d94a3b', '#3fa85a', '#e48a2c', '#8a4fc7', '#ecece6', '#6b6880']

const bit = (field: number, i: number) => (field & (1 << i)) !== 0
const has = (p: PartySave, item: ItemName) => (p.items & ITEM_FLAGS[item]) !== 0

const whereLine = (p: PartySave): string => {
  if (p.location === 0) return `Britannia (${p.x},${p.y})`
  const name = LOCATIONS[p.location]?.name ?? `Unknown (${p.location})`
  return p.dungeonLevel < 8 ? `${name}, level ${p.dungeonLevel + 1}` : name
}

function Gem({ i, on }: { i: number; on: boolean }) {
  return <span className={`d-gem${on ? ' on' : ''}`} style={{ '--c': STONE_COLORS[i] } as React.CSSProperties} title={`${STONES[i]} stone`} />
}

function Hero({ state, p, art }: { state: GameState; p: PartySave; art: DashboardArt | null }) {
  const me = p.allRecords[0]
  const chip = unsavedChip(state.unsavedMoves, canSaveHere(p))
  const g = gateState(p.trammel, p.felucca)
  const live = state.source === 'memory'
  return (
    <section className="d-hero">
      {art && <img src={art.avatar} alt="" />}
      <div>
        <h2>{me?.name || 'Avatar'}, the Seeker</h2>
        {me && (
          <div className="d-sub">
            {CLASSES[me.classIndex] ?? `#${me.classIndex}`} · Level {Math.floor(me.hpMax / 100)} · HP {me.hp}/{me.hpMax} · {p.gold} gold · {Math.floor(p.food / 100)} food
          </div>
        )}
        <div className="d-sub">{whereLine(p)} · {p.moves} moves</div>
      </div>
      <div className="d-chips">
        <span className={`d-chip${live ? ' live' : ''}`}>{live ? '● LIVE (memory)' : 'Save file'}</span>
        {chip && <span className={`d-chip unsaved ${chip.level}`} title={chip.hint}>{chip.text} · {chip.hint.split(' · ')[1]}</span>}
        <span className="d-chip">Trammel {PHASE_NAMES[p.trammel & 7]!.toLowerCase()} · Felucca {PHASE_NAMES[p.felucca & 7]!.toLowerCase()}</span>
        <span className="d-chip">Moongate: {g.open.near} → {g.destination.near}</span>
      </div>
    </section>
  )
}

function VirtueCards({ p, art }: { p: PartySave; art: DashboardArt | null }) {
  return (
    <section className="panel d-virtues-panel">
      <h3>The Eight Virtues</h3>
      <div className="d-virtues">
        {VIRTUES.map((v, i) => {
          const k = p.karma[i] ?? 0
          const avatar = k === 0
          const src = art?.virtues[v]
          return (
            <div key={v} className={`d-vcard${avatar ? ' gold' : ''}`}>
              {src ? <img className="art" src={src} alt={v} /> : <div className="art ph">{v}</div>}
              {avatar && <div className="d-ankh" title="Partial Avatarhood">☥</div>}
              <div className="d-meter"><div className="d-fill" style={{ width: `${avatar ? 100 : Math.min(100, (k / 99) * 100)}%` }} /></div>
              <div className="d-vrow">
                <span className="k">{avatar ? 'Partial Avatar' : `${k} / 99`}</span>
                <span className="d-badges">
                  <span className={`d-rune${bit(p.runes, i) ? ' on' : ''}`} title={`Rune of ${v}`}>R</span>
                  <Gem i={i} on={bit(p.stones, i)} />
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

const Slot = ({ label, on }: { label: string; on: boolean }) => <span className={`d-slot${on ? ' on' : ''}`}>{label}</span>

function Quest({ p }: { p: PartySave }) {
  return (
    <section className="panel d-quest">
      <h3>Quest of the Avatar</h3>
      <div className="d-qrow"><span className="d-ql">Runes</span>{VIRTUES.map((v, i) => <Slot key={v} label={v.slice(0, 3)} on={bit(p.runes, i)} />)}</div>
      <div className="d-qrow"><span className="d-ql">Stones</span>{STONES.map((_, i) => <Gem key={i} i={i} on={bit(p.stones, i)} />)}</div>
      <div className="d-qrow"><span className="d-ql">Key</span><Slot label="Truth" on={has(p, 'keyT')} /><Slot label="Love" on={has(p, 'keyL')} /><Slot label="Courage" on={has(p, 'keyC')} /></div>
      <div className="d-qrow"><span className="d-ql">Abyss</span><Slot label="Bell" on={has(p, 'bell') || has(p, 'bellUsed')} /><Slot label="Book" on={has(p, 'book') || has(p, 'bookUsed')} /><Slot label="Candle" on={has(p, 'candle') || has(p, 'candleUsed')} /></div>
      <div className="d-qrow"><span className="d-ql">Relics</span><Slot label="Horn" on={has(p, 'horn')} /><Slot label="Wheel" on={has(p, 'wheel')} /><Slot label="Skull" on={has(p, 'skull') || has(p, 'skullDestroyed')} /></div>
    </section>
  )
}

function Next({ p, nudges, onOpen }: { p: PartySave; nudges: boolean; onOpen: () => void }) {
  const topics = suggestedTopics(progress(p), p.location).slice(0, 3)
  return (
    <section className="panel d-next">
      <h3>Suggested next</h3>
      {topics.length === 0 ? <p className="muted small">Nothing to suggest right now.</p> : (
        <ul>
          {topics.map((t) => (
            <li key={t.id}>
              <button className="d-topic" onClick={onOpen}>
                {t.title}
                {nudges && <small>{t.tiers[0]}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Timers({ p }: { p: PartySave }) {
  const c = cooldowns(p)
  const row = (name: string, t: { ready: boolean; movesLeft: number }) => (
    <div><span>{name}</span><b className={t.ready ? '' : 'w'}>{timerLabel(t).toLowerCase()}</b></div>
  )
  return (
    <section className="panel d-timers">
      <h3>Timers</h3>
      {row('Meditation', c.meditation)}
      {row('Camping', c.camp)}
      {row('Virtue talk', c.virtue)}
    </section>
  )
}

function Companions({ p, art }: { p: PartySave; art: DashboardArt | null }) {
  const avatarClass = p.allRecords[0]?.classIndex ?? -1
  return (
    <section className="panel d-companions">
      <h3>Companions</h3>
      <div className="d-comps">
        {COMPANIONS.map((c) => {
          const st = companionStatus(c, p.members, avatarClass)
          const m = st === 'party' ? p.members.find((r) => r.name === c.name) : undefined
          const low = !!m && (m.status === 'D' || (m.hpMax > 0 && m.hp / m.hpMax < 0.25))
          return (
            <div key={c.name} className={`d-comp ${st === 'party' ? 'joined' : 'locked'}${st === 'sameClass' ? ' same' : ''}`}>
              <div className="d-frame">{art && <img src={art.classes[c.classIndex]} alt="" />}</div>
              {m && (
                <div className="d-cbar" title={`HP ${m.hp}/${m.hpMax}`}>
                  <div className="bar"><div className={`fill ${low ? 'low' : 'hp'}`} style={{ width: `${m.hpMax > 0 ? Math.min(100, (m.hp / m.hpMax) * 100) : 0}%` }} /></div>
                  <span className={`s-${m.status}`} title={STATUS[m.status as keyof typeof STATUS] ?? m.status}>{m.status}</span>
                </div>
              )}
              <div className="d-cn">{c.name}</div>
              <div className="d-cc">{CLASSES[c.classIndex]}</div>
              <div className="d-cs">{STATUS_TEXT[st]}</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function Dashboard({ state, onNavigate }: { state: GameState | null; onNavigate: (v: 'Hints') => void }) {
  const p = state?.party ?? null
  const art = useDashboardArt(state?.gameDir ?? null)
  const { journal } = useJournal()
  // hold nudges back until the journal has loaded, so nothing flashes past an 'off' setting
  const nudges = (journal?.spoilerLevel ?? 'off') !== 'off'
  if (!p) {
    return (
      <>
        <h2>Dashboard</h2>
        <p className="muted">Waiting for a save file…</p>
        <p className="muted small">Press Play Ultima IV in the sidebar to start the game.</p>
      </>
    )
  }
  return (
    <div className="dash">
      <Hero state={state!} p={p} art={art} />
      <VirtueCards p={p} art={art} />
      <aside className="d-right">
        <Quest p={p} />
        <Next p={p} nudges={nudges} onOpen={() => onNavigate('Hints')} />
        <Timers p={p} />
      </aside>
      <Companions p={p} art={art} />
    </div>
  )
}
