import { useEffect, useState } from 'react'
import type { GameState, SettingsInfo } from '@shared/types'

interface Props {
  state: GameState | null
  onState: (s: GameState | null) => void
}

export function Settings({ state, onState }: Props) {
  const [info, setInfo] = useState<SettingsInfo | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    window.u4.getSettings().then(setInfo)
  }, [state?.gameDir, state?.savePath])

  // attachment changes as DOSBox starts and stops, so poll while the view is open
  useEffect(() => {
    const t = setInterval(() => window.u4.getSettings().then(setInfo, () => undefined), 2000)
    return () => clearInterval(t)
  }, [])

  const choose = async () => {
    const s = await window.u4.chooseGameDir()
    if (s) onState(s)
  }

  const toggleLive = async (on: boolean) => {
    setBusy(true)
    try {
      const s = await window.u4.setLiveMemory(on)
      if (s) onState(s)
      setInfo(await window.u4.getSettings())
    } finally {
      setBusy(false)
    }
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
      <section className="panel settings">
        <h3>Live memory mode</h3>
        <label className="check">
          <input
            type="checkbox" checked={info?.liveMemory ?? false} disabled={!info || busy}
            onChange={(e) => toggleLive(e.target.checked)}
          /> Read the game live from DOSBox
        </label>
        <p className="muted small">
          Reads DOSBox's memory read-only, so the Tracker and maps update as you play instead of on save.
          It only works while the game is running; otherwise the companion falls back to the save file.
        </p>
        {info?.liveMemory && (
          <p className={info.attachedPid !== null ? 'ok' : 'muted'}>
            {info.attachedPid !== null ? `Attached to DOSBox (PID ${info.attachedPid})` : 'Not attached'}
          </p>
        )}
      </section>
    </>
  )
}
