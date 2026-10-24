// Sidebar game speed (#70): the preset used at launch, applied live to the running
// game with DOSBox's own speed keys (DOSBox comes to the front for a moment).
import { useEffect, useState } from 'react'
import { SPEEDS, SPEED_NAMES, speedOf } from '@shared/speed'
import type { Speed } from '@shared/speed'

export function GameSpeed() {
  const [speed, setSpeed] = useState<Speed | null>(null)
  const [running, setRunning] = useState<number | 'max' | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const refresh = (): void => {
    window.u4.getGameSpeed().then((r) => { setSpeed(r.speed); setRunning(r.running) }, () => undefined)
  }
  useEffect(refresh, [])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 6000)
    return () => clearTimeout(t)
  }, [msg])

  const choose = async (s: Speed): Promise<void> => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await window.u4.setGameSpeed(s)
      setSpeed(s)
      if (r.ok) {
        setRunning(r.running)
        setMsg({ ok: true, text: r.running === null ? `${SPEED_NAMES[s]} from the next launch.` : `Game speed: ${r.running} cycles.` })
      } else setMsg({ ok: false, text: r.message })
    } finally {
      setBusy(false)
      refresh()
    }
  }

  const live = speedOf(running)
  return (
    <div className="speed-ctl" title="Ultima IV's speed in DOSBox cycles. Original is GOG's 500. Changing it while the game runs brings DOSBox to the front and presses its speed keys.">
      <div className="speed-label small">
        Game speed{running !== null && <span className="muted"> · {running === 'max' ? 'max' : `${running}`}{live ? '' : ' (custom)'}</span>}
      </div>
      <div className="speed-btns">
        {(Object.keys(SPEEDS) as Speed[]).map((s) => (
          <button key={s} className={`btn small${(running !== null ? live === s : speed === s) ? ' active' : ''}`} disabled={busy} onClick={() => void choose(s)}>
            {SPEED_NAMES[s]}
          </button>
        ))}
      </div>
      {msg && <p className={`result small ${msg.ok ? 'ok' : 'error'}`}>{msg.text}</p>}
    </div>
  )
}
