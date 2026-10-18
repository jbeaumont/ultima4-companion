import { LOCATIONS, VIRTUES } from '@domain/constants'
import { PHASE_NAMES } from '@domain/moongates'
import type { PartySave } from '@parsers/party'
import { canSaveHere } from '@domain/unsaved'
import { unsavedChip } from '@domain/unsavedChip'
import { useGameState } from './useGameState'

const MOON_GLYPHS = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘']

const placeName = (p: PartySave): string => {
  const name = p.location === 0 ? 'Britannia' : LOCATIONS[p.location]?.name ?? `Unknown (${p.location})`
  return p.dungeonLevel !== 0xffff && p.dungeonLevel < 8 ? `${name} · L${p.dungeonLevel + 1}` : name
}

const Moon = ({ label, phase }: { label: string; phase: number }) => (
  <span title={`${label}: ${PHASE_NAMES[phase] ?? phase}`}>
    {label[0]} {MOON_GLYPHS[phase] ?? '?'} {phase}
  </span>
)

/** Compact always-on-top window: party HP, virtues and moons at a glance. */
export function Hud() {
  const [state] = useGameState()
  const p = state?.party ?? null
  const members = p ? (p.memberCount === 0 ? p.allRecords.slice(0, 1) : p.members) : []
  const chip = p ? unsavedChip(state?.unsavedMoves, canSaveHere(p)) : null
  const saved = !!p && state?.unsavedMoves === 0
  return (
    <div className="hud">
      <header className="hud-head">
        <span className="hud-title">{p ? placeName(p) : 'Ultima IV'}</span>
        {state && (
          <span className={`source-badge ${state.source === 'memory' ? 'live' : ''}`}>
            {state.source === 'memory' ? 'LIVE' : 'Save'}
          </span>
        )}
        {chip && <span className={`unsaved-chip compact ${chip.level}`} title={chip.hint}>Unsaved {state?.unsavedMoves}</span>}
        {saved && <span className="hud-saved" title="Nothing unsaved">Saved</span>}
        <button className="hud-close" title="Close HUD" onClick={() => void window.u4.toggleHud()}>×</button>
      </header>
      {p ? (
        <div className="hud-body">
          <div className="hud-party">
            {members.map((m, i) => {
              const low = m.hpMax > 0 && m.hp / m.hpMax < 0.25
              const width = `${m.hpMax > 0 ? Math.min(100, (m.hp / m.hpMax) * 100) : 0}%`
              return (
                <div key={i} className="hud-member">
                  <span className="hud-name" title={m.name}>{m.name || '(unnamed)'}</span>
                  <div className="bar hud-bar">
                    <div className={`fill ${low || m.status === 'D' ? 'low' : 'hp'}`} style={{ width }} />
                    <span className="hud-hp">{m.hp}</span>
                  </div>
                  <span className={`hud-status s-${m.status}`}>{m.status}</span>
                </div>
              )
            })}
          </div>
          <div className="hud-side">
            <div className="hud-virtues">
              {VIRTUES.map((v, i) => {
                const k = p.karma[i] ?? 0
                return (
                  <div key={v} className="hud-virtue" title={`${v}: ${k === 0 ? 'Avatar' : k}`}>
                    <span>{v === 'Honor' ? 'Hnr' : v.slice(0, 3)}</span>
                    <div className="bar">
                      <div className="fill karma" style={{ width: `${k === 0 ? 100 : Math.min(100, (k / 99) * 100)}%` }} />
                    </div>
                    <span className="avatar">{k === 0 ? '☥' : ''}</span>
                  </div>
                )
              })}
            </div>
            <div className="hud-moons">
              <Moon label="Trammel" phase={p.trammel} />
              <Moon label="Felucca" phase={p.felucca} />
            </div>
          </div>
        </div>
      ) : (
        <p className="muted small hud-wait">{state?.message ?? 'Waiting for game…'}</p>
      )}
    </div>
  )
}
