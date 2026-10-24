import { useEffect, useState } from 'react'
import type { PartySave } from '@parsers/party'
import { CLASSES, ITEM_FLAGS, LOCATIONS, STATUS, STONES, VIRTUES } from '@domain/constants'
import type { ItemName } from '@domain/constants'
import { COMPANIONS, STATUS_TEXT, companionStatus, joinReadiness } from '@domain/companions'
import { cooldowns } from '@domain/cooldowns'
import { HINTS, visibleTiers } from '@domain/hints'
import type { SpoilerLevel } from '@domain/hints'
import { shrineAdvice } from '@domain/shrine'
import { PHASE_NAMES, gateState } from '@domain/moongates'
import { nextSteps } from '@domain/guidance'
import { disclosure } from '@domain/spoilers'
import { hawkwindBand } from '@domain/hawkwind'
import { partyAlerts } from '@domain/partyCondition'
import { canSaveHere } from '@domain/unsaved'
import { unsavedChip } from '@domain/unsavedChip'
import { timerLabel } from '@shared/format'
import type { GameState } from '@shared/types'
import { differentAvatar } from '@shared/profiles'
import { sourceLabel } from '@shared/observationLabel'
import { useNow } from '../useNow'
import type { Profile, ProfileIndex } from '@shared/profiles'
import { BattlePanel } from '../components/BattlePanel'
import { useDashboardArt } from '../useDashboardArt'
import type { DashboardArt } from '../useDashboardArt'
import { useJournal } from '../useJournal'
import { useNewPlaythrough } from '../useNewPlaythrough'

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
  const [playthrough, setPlaythrough] = useState<Profile | undefined>()
  useEffect(() => {
    void window.u4.listProfiles().then((i) => setPlaythrough(i.profiles.find((q) => q.id === i.active)))
  }, [me?.name])
  const chip = unsavedChip(state.unsavedMoves, canSaveHere(p))
  const g = gateState(p.trammel, p.felucca)
  const now = useNow(1000)
  const label = sourceLabel(state, now)
  const alerts = partyAlerts(p)
  return (
    <section className="d-hero">
      {art && <img src={art.avatar} alt="" />}
      <div>
        <h2>{me?.name || 'Avatar'}, the Seeker</h2>
        {me && (
          <div className="d-sub">
            {CLASSES[me.classIndex] ?? `#${me.classIndex}`} · <span title="Level is max HP ÷ 100, as on the game's Z screen. New characters start at 1 to 3 by class.">Level {Math.floor(me.hpMax / 100)}</span> · HP {me.hp}/{me.hpMax} · {p.gold} gold · {Math.floor(p.food / 100)} food
          </div>
        )}
        <div className="d-sub">{whereLine(p)} · {p.moves} moves</div>
      </div>
      <div className="d-chips">
        {differentAvatar(playthrough, me?.name) && (
          <span className="d-chip unsaved warn" title="Start a playthrough for this character in Settings so their notes and map stay separate">
            This playthrough ({playthrough!.name}) is for {playthrough!.avatar} · Settings → Playthroughs
          </span>
        )}
        {alerts.slice(0, 3).map((a) => (
          <span key={a.text} className={`d-chip unsaved ${a.level}`} title={a.hint}>{a.text} · {a.hint}</span>
        ))}
        {alerts.length > 3 && <span className="d-chip unsaved warn" title={alerts.slice(3).map((a) => a.text).join(', ')}>+{alerts.length - 3} more</span>}
        <span className={`d-chip ${label.level === 'live' ? 'live' : label.level === 'warn' ? 'unsaved warn' : ''}`} title={label.title}>{label.text}</span>
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
                <span className="k" title={hawkwindBand(k).label}>{avatar ? 'Partial Avatar' : `${k} / 99`}</span>
                <span className="d-badges">
                  <span className={`d-rune${bit(p.runes, i) ? ' on' : ''}`} title={`Rune of ${v}`}>R</span>
                  <Gem i={i} on={bit(p.stones, i)} />
                </span>
              </div>
              {!avatar && <div className={`d-band b${hawkwindBand(k).step}`}>{hawkwindBand(k).label}</div>}
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

function Next({ p, level, onOpen }: { p: PartySave; level: SpoilerLevel; onOpen: () => void }) {
  const steps = nextSteps(p, level)
  return (
    <section className="panel d-next">
      <h3>Suggested next</h3>
      {steps.length === 0 ? <p className="muted small">Nothing to suggest right now.</p> : (
        <ul>
          {steps.map((s) => (
            <li key={s.id}>
              <button className={`d-topic${s.elevation ? ' d-elevate' : ''}`} onClick={onOpen}>
                {s.title}
                {s.detail && <small>{s.detail}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ShrinePanel({ p, level, revealed, onOpen }: { p: PartySave; level: SpoilerLevel; revealed: Record<string, number>; onOpen: () => void }) {
  const a = shrineAdvice(p)
  if (!a) return null
  const topic = HINTS.find((h) => h.id === `mantra-${a.virtue.toLowerCase()}`)
  const known = topic ? visibleTiers(topic, level, revealed[topic.id] ?? 0) : []
  const mantra = known.length === 3 ? known[2] : null
  return (
    <section className="panel d-shrine">
      <h3>Meditating at the Shrine of {a.virtue}</h3>
      {/* also true while a meditation is under way, so say it plainly rather than as a warning */}
      {!a.rested && <p className="d-shrine-warn">One meditation per hundred moves: the next can begin in {a.movesLeft} moves.</p>}
      <ol>
        <li>When asked what you meditate upon, type <b>{a.virtue}</b>.</li>
        <li>Choose <b>3</b> cycles{a.stage === 'elevate' ? ' (all three are needed for Avatarhood)' : ''}.</li>
        <li>
          After each count of dots, enter the mantra.{' '}
          {mantra ?? (known.length ? <>Your hint so far: <i>{known[known.length - 1]}</i> </> : null)}
          {!mantra && <button className="link" onClick={onOpen}>Open Hints</button>}
        </li>
      </ol>
      <p className="muted small">
        {a.stage === 'avatar'
          ? `You are already a partial Avatar of ${a.virtue}; meditating still adds Spirituality and a vision.`
          : a.stage === 'elevate'
            ? `${a.virtue} is at 99: three good cycles now grant partial Avatarhood.`
            : `Each good cycle adds 3 Spirituality. Avatarhood needs ${a.virtue} at 99 (now ${a.karma}); a wrong mantra costs 3 Spirituality.`}
      </p>
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
      <div title="Consulting Hawkwind uses the same once-per-hundred-moves timer">
        <span>Meditation / Hawkwind</span><b className={c.meditation.ready ? '' : 'w'}>{timerLabel(c.meditation).toLowerCase()}</b>
      </div>
      {row('Camping', c.camp)}
      {row('Virtue talk', c.virtue)}
    </section>
  )
}

/** Card line for a companion not yet in the party; the town is shown unless hints are off. */
function joinText(r: ReturnType<typeof joinReadiness>, towns: boolean): string | null {
  if (r.kind === 'ready') return towns ? `Can join now · in ${r.town}` : 'Can join now'
  if (r.kind === 'needs') return `Needs ${r.reasons.join(' and ')}`
  return null
}

function Companions({ p, art, towns }: { p: PartySave; art: DashboardArt | null; towns: boolean }) {
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
              <div className="d-cs">{joinText(joinReadiness(c, p), towns) ?? STATUS_TEXT[st]}</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** A new playthrough whose save still holds another character: what to do, instead of that character's details. */
function NewPlaythrough({ index, p, onFollow }: { index: ProfileIndex; p: PartySave; onFollow: () => void }) {
  const active = index.profiles.find((q) => q.id === index.active)!
  const me = p.allRecords[0]!
  const owner = index.profiles.find((q) => q.id !== active.id && q.avatar === me.name)
  return (
    <section className="panel d-newgame">
      <h2>New playthrough: {active.name}</h2>
      <p>
        The game's save still holds <strong>{me.name}</strong>{owner ? ` from "${owner.name}"` : ''} ({CLASSES[me.classIndex] ?? 'Avatar'}, {p.moves} moves).
        This playthrough has not started yet, so its journal and map stay empty.
      </p>
      <p>
        To begin, start a new game in Ultima IV: press <strong>Play Ultima IV</strong>, then at the title choose <strong>Initiate New Game</strong> and
        answer the fortune teller. The companion follows your new character from then on.
      </p>
      <div className="d-newgame-actions">
        <button className="btn" onClick={onFollow}>Follow {me.name} in this playthrough instead</button>
        <span className="muted small">Snapshots can bring back an earlier save at any time.</span>
      </div>
    </section>
  )
}

export function Dashboard({ state, onNavigate }: { state: GameState | null; onNavigate: (v: 'Hints') => void }) {
  const p = state?.party ?? null
  const art = useDashboardArt(state?.gameDir ?? null)
  const { journal } = useJournal()
  const { waiting, index, follow } = useNewPlaythrough(p)
  // hold nudges back until the journal has loaded, so nothing flashes past an 'off' setting
  const towns = disclosure(journal?.spoilerLevel ?? 'off').companionTowns
  if (!p) {
    return (
      <>
        <h2>Dashboard</h2>
        <p className="muted">Waiting for a save file…</p>
        <p className="muted small">Press Play Ultima IV in the sidebar to start the game.</p>
      </>
    )
  }
  // until the playthroughs load, show nothing rather than flash a character this playthrough may not follow
  if (!index) return <div className="dash" />
  if (waiting) {
    return (
      <div className="dash">
        <NewPlaythrough index={index!} p={p} onFollow={follow} />
      </div>
    )
  }
  return (
    <div className="dash">
      <Hero state={state!} p={p} art={art} />
      <ShrinePanel p={p} level={journal?.spoilerLevel ?? 'off'} revealed={journal?.revealed ?? {}} onOpen={() => onNavigate('Hints')} />
      {state?.battle && <BattlePanel battle={state.battle} party={p} />}
      <VirtueCards p={p} art={art} />
      <aside className="d-right">
        <Quest p={p} />
        <Next p={p} level={journal ? journal.spoilerLevel : 'off'} onOpen={() => onNavigate('Hints')} />
        <Timers p={p} />
      </aside>
      <Companions p={p} art={art} towns={towns} />
    </div>
  )
}
