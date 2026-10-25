// Every key in one place (#controls): the game's commands with where they work,
// moving, talking, the title screen, DOSBox's own keys and the companion's.
import { useState } from 'react'
import { COMPANION_KEYS, DOSBOX_KEYS, GAME_COMMANDS, MOVING, TALKING, TITLE_SCREEN } from '@shared/controls'
import type { KeyRow } from '@shared/controls'

const matches = (q: string, ...texts: string[]) => !q || texts.some((t) => t.toLowerCase().includes(q))

function Rows({ title, note, rows, q }: { title: string; note?: string; rows: KeyRow[]; q: string }) {
  const shown = rows.filter((r) => matches(q, r.keys, r.what))
  if (!shown.length) return null
  return (
    <section className="panel controls-group">
      <h3>{title}</h3>
      {note && <p className="small muted">{note}</p>}
      <table className="controls-table">
        <tbody>
          {shown.map((r) => (
            <tr key={r.keys}><td><kbd>{r.keys}</kbd></td><td>{r.what}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export function Controls() {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const commands = GAME_COMMANDS.filter((x) => matches(q, x.key, x.name, x.what))
  const yes = (on: boolean) => <td className={on ? 'controls-yes' : 'controls-no'}>{on ? '✓' : '–'}</td>

  return (
    <>
      <h2>Controls</h2>
      <div className="toolbar">
        <input className="search" placeholder="Search keys (e.g. torch, save, mouse)" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {commands.length > 0 && (
        <section className="panel controls-group">
          <h3>Game commands</h3>
          <p className="small muted">One letter each. Where a command is not allowed the game says "Not here!".</p>
          <table className="controls-table">
            <thead>
              <tr><th>Key</th><th>Command</th><th>What it does</th><th title="Britannia and towns">Outdoors / towns</th><th>Dungeons</th><th>Combat</th></tr>
            </thead>
            <tbody>
              {commands.map((x) => (
                <tr key={x.key}>
                  <td><kbd>{x.key}</kbd></td><td>{x.name}</td><td>{x.what}</td>
                  {yes(x.surface)}{yes(x.dungeon)}{yes(x.combat)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <Rows title="Moving" rows={MOVING} q={q} />
      <Rows title="Talking" note="After T and a direction, type a word and Enter." rows={TALKING} q={q} />
      <Rows title="Title screen" rows={TITLE_SCREEN} q={q} />
      <Rows title="DOSBox" note="Keys for the emulator the game runs in. Use them while the game window is in front." rows={DOSBOX_KEYS} q={q} />
      <Rows title="Companion" rows={COMPANION_KEYS} q={q} />
    </>
  )
}
