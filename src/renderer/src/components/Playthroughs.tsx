import { useEffect, useState } from 'react'
import type { ProfileIndex } from '@shared/profiles'

/**
 * Playthrough profiles: each keeps its own journal (notes, clues, towns visited,
 * people met, hints revealed) and explored map. Switching reloads the window so
 * every view shows the other playthrough.
 */
export function Playthroughs() {
  const [index, setIndex] = useState<ProfileIndex | null>(null)
  const [name, setName] = useState('')
  useEffect(() => {
    void window.u4.listProfiles().then(setIndex)
  }, [])
  if (!index) return null
  const switchTo = async (id: string) => {
    await window.u4.switchProfile(id)
    location.reload()
  }
  const create = async () => {
    const next = await window.u4.createProfile(name)
    setName('')
    setIndex(next)
  }
  return (
    <section className="panel settings">
      <h3>Playthroughs</h3>
      <p className="muted small">
        Each playthrough keeps its own notes, clues, towns visited, people met, hints revealed and explored map. Start a new one for a new
        character so nothing from this game shows up there. Restoring a save keeps the current playthrough's notes and map.
      </p>
      <ul className="playthroughs">
        {index.profiles.map((p) => (
          <li key={p.id}>
            <b>{p.name}</b>
            {p.avatar && <span className="muted small"> · {p.avatar}</span>}
            {p.id === index.active ? (
              <span className="talked"> ● current</span>
            ) : (
              <button className="btn small" onClick={() => void switchTo(p.id)}>Switch</button>
            )}
          </li>
        ))}
      </ul>
      <div className="row">
        <input value={name} placeholder="New playthrough name" maxLength={60} onChange={(e) => setName(e.target.value)} />
        <button className="btn" disabled={!name.trim()} onClick={() => void create()}>Add playthrough</button>
      </div>
    </section>
  )
}
