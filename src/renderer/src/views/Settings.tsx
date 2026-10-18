import { useEffect, useState } from 'react'
import type { GameState, SettingsInfo } from '@shared/types'

interface Props {
  state: GameState | null
  onState: (s: GameState | null) => void
}

export function Settings({ state, onState }: Props) {
  const [info, setInfo] = useState<SettingsInfo | null>(null)
  useEffect(() => {
    window.u4.getSettings().then(setInfo)
  }, [state?.gameDir, state?.savePath])

  const choose = async () => {
    const s = await window.u4.chooseGameDir()
    if (s) onState(s)
  }

  return (
    <>
      <h2>Settings</h2>
      <section className="panel settings">
        <dl>
          <dt>Game folder</dt>
          <dd>{info?.gameDir ?? <span className="muted">not found</span>}</dd>
          <dt>Save file</dt>
          <dd>{info?.savePath ?? <span className="muted">none</span>}</dd>
          <dt>Manual override</dt>
          <dd>{info?.override ?? <span className="muted">none (auto-detected)</span>}</dd>
        </dl>
        <button className="btn" onClick={choose}>Choose folder…</button>
        <p className="muted small">Read-only: the companion never writes to the game folder.</p>
      </section>
    </>
  )
}
