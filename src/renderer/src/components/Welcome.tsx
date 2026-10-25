// First-run welcome (#65): what the companion is, what it found, a spoiler level,
// and a short tour. Shown once (settings.welcomeSeen); Settings can open it again.
import { useEffect, useState } from 'react'
import { CLASSES, LOCATIONS } from '@domain/constants'
import type { GameState, SettingsInfo } from '@shared/types'
import type { ProfileIndex } from '@shared/profiles'
import { useJournal } from '../useJournal'
import { LEVELS } from '../spoilerLevels'

const TOUR: [string, string][] = [
  ['Dashboard', 'Your Avatar at a glance: virtues, quest items, suggested next steps, timers and companions.'],
  ['Tracker', 'Every number in your save: party, inventory, reagents, position.'],
  ['Map', 'Britannia, towns and dungeons, with the party marker and the places you have explored.'],
  ['Journal', 'An automatic quest checklist plus your own notes.'],
  ['Hints', 'Hints for every quest step, revealed one tier at a time within your spoiler level.'],
  ['Spellbook', 'Every spell: what it does, its reagents and MP, and what you can mix and cast now.'],
  ['Dialogue', 'What the people you have met said, searchable by keyword.'],
  ['Snapshots', 'Backups of your single save slot, taken every time it changes.'],
  ['Editor', 'Change your save (off by default; DOSBox must be closed).'],
  ['Controls', 'Every key: the game’s commands, talking, DOSBox and the companion.']
]

export function Welcome({ state, info, onClose }: { state: GameState | null; info: SettingsInfo | null; onClose: () => void }) {
  const { journal, update } = useJournal()
  const [index, setIndex] = useState<ProfileIndex | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void window.u4.listProfiles().then(setIndex, () => undefined)
  }, [])
  const p = state?.party ?? null
  const me = p?.allRecords[0]
  const active = index?.profiles.find((q) => q.id === index.active)
  const where = p ? (p.location === 0 ? 'Britannia' : LOCATIONS[p.location]?.name ?? 'somewhere') : ''

  const finish = (): void => {
    void window.u4.setWelcomeSeen(true).finally(onClose)
  }
  // a new game gets its own playthrough, so its journal and map start empty
  const newGame = async (): Promise<void> => {
    setBusy(true)
    try {
      const next = await window.u4.createProfile(`New game ${new Date().toLocaleDateString()}`)
      const created = next.profiles[next.profiles.length - 1]!
      await window.u4.setWelcomeSeen(true)
      await window.u4.switchProfile(created.id)
      location.reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="welcome-backdrop" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="welcome">
        <h2 id="welcome-title">Welcome to the Ultima IV Companion</h2>
        <p>
          The companion sits beside the game and follows your Avatar: it reads your save, and while the game runs it reads the
          game's memory too, so it stays up to date move by move. It never changes the game unless you use the Editor or restore
          a snapshot, and both ask first.
        </p>

        <section>
          <h3>Your game</h3>
          {info?.gameDir ? <p className="small">Ultima IV found at <code>{info.gameDir}</code>.</p> : (
            <p className="small">Ultima IV was not found. Set its folder in Settings once the welcome is closed.</p>
          )}
          {me ? (
            <>
              <p>
                Your save holds <strong>{me.name}</strong>, {CLASSES[me.classIndex] ?? 'Avatar'}, in {where} after {p!.moves} {p!.moves === 1 ? "move" : "moves"}.
                {active ? ` The companion files this under the playthrough "${active.name}".` : ''}
              </p>
              <div className="welcome-choice">
                <button className="btn" disabled={busy} onClick={finish}>Continue with {me.name}</button>
                <button className="btn" disabled={busy} onClick={() => void newGame()}>I'm starting a new game</button>
              </div>
              <p className="muted small">
                A new game gets its own playthrough, so its notes and map start empty. Start it in Ultima IV with Initiate New Game
                at the title screen.
              </p>
            </>
          ) : (
            <p className="small">No save yet. Press <strong>Play Ultima IV</strong> and choose Initiate New Game; the companion picks your Avatar up from there.</p>
          )}
        </section>

        <section>
          <h3>How much help?</h3>
          <div className="toolbar">
            {LEVELS.map((l) => (
              <button key={l.id} className={`btn small${journal?.spoilerLevel === l.id ? ' active' : ''}`} onClick={() => update((j) => ({ ...j, spoilerLevel: l.id }))}>
                {l.label}
              </button>
            ))}
          </div>
          <p className="muted small">{LEVELS.find((l) => l.id === journal?.spoilerLevel)?.blurb ?? 'Pick one; you can change it any time in Hints.'}</p>
        </section>

        <section>
          <h3>Good to know</h3>
          <ul className="small">
            <li><strong>Play Ultima IV</strong> in the sidebar starts the game; with it running the companion updates live.</li>
            <li>The game itself only saves when you press <strong>Q</strong> outdoors. The Dashboard shows how many moves are unsaved.</li>
            <li>Ultima IV has a single save slot. <strong>Snapshots</strong> keeps a copy every time it changes; take one before anything risky.</li>
            <li>The optional <strong>AI sage</strong> answers questions in character within your spoiler level. It is off until you turn it on in Settings and needs an Anthropic API key.</li>
          </ul>
        </section>

        <section>
          <h3>Around the companion</h3>
          <dl className="welcome-tour small">
            {TOUR.map(([name, text]) => (
              <div key={name}><dt>{name}</dt><dd>{text}</dd></div>
            ))}
          </dl>
        </section>

        <div className="welcome-foot">
          <span className="muted small">Settings can show this again.</span>
          <button className="btn" onClick={finish}>{me ? 'Done' : 'Got it'}</button>
        </div>
      </div>
    </div>
  )
}
