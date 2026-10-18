import { useEffect, useState } from 'react'
import { useGameState } from './useGameState'
import { Dashboard } from './views/Dashboard'
import { Dialogue } from './views/Dialogue'
import { Editor } from './views/Editor'
import { Hints } from './views/Hints'
import { JournalView } from './views/Journal'
import { MapView } from './views/Map'
import { Sage } from './views/Sage'
import { Settings } from './views/Settings'
import { Snapshots } from './views/Snapshots'
import { Tracker } from './views/Tracker'

const VIEWS = ['Dashboard', 'Tracker', 'Map', 'Journal', 'Hints', 'Sage', 'Dialogue', 'Snapshots', 'Editor', 'Settings'] as const
type View = (typeof VIEWS)[number]

export function App() {
  const [view, setView] = useState<View>('Dashboard')
  const [state, setState] = useGameState()
  const [sageOn, setSageOn] = useState(false)
  const [testMode, setTestMode] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [launchMsg, setLaunchMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    const refresh = (): void => {
      window.u4.getSettings().then((s) => {
        setSageOn(s.sageEnabled)
        setTestMode(s.testMode)
      }, () => undefined)
    }
    refresh()
    window.addEventListener('u4-settings-changed', refresh)
    return () => window.removeEventListener('u4-settings-changed', refresh)
  }, [])
  useEffect(() => {
    if (!sageOn && view === 'Sage') setView('Settings')
  }, [sageOn, view])

  useEffect(() => {
    if (!launchMsg) return
    const t = setTimeout(() => setLaunchMsg(null), 6000)
    return () => clearTimeout(t)
  }, [launchMsg])

  const launch = (): void => {
    setLaunching(true)
    setLaunchMsg(null)
    window.u4.launchGame().then(
      (r) => setLaunchMsg(r.ok ? { ok: true, text: 'Game launched.' } : { ok: false, text: r.message }),
      () => setLaunchMsg({ ok: false, text: 'Could not launch the game.' })
    ).finally(() => setLaunching(false))
  }

  return (
    <div className="app">
      <nav className="sidebar">
        <h1>Ultima IV</h1>
        {testMode && <div className="test-badge">TEST INSTANCE</div>}
        {VIEWS.filter((v) => v !== 'Sage' || sageOn).map((v) => (
          <button key={v} className={v === view ? 'active' : ''} onClick={() => setView(v)}>
            {v}
          </button>
        ))}
        <button className="hud-btn play-btn" disabled={launching} onClick={launch}>
          {testMode ? 'Launch test game (turbo)' : 'Play Ultima IV'}
        </button>
        {launchMsg && <p className={`result small ${launchMsg.ok ? 'ok' : 'error'}`}>{launchMsg.text}</p>}
        <button className="hud-btn pop-btn" onClick={() => void window.u4.toggleHud()}>Pop-out HUD</button>
      </nav>
      <main className="content">
        {/* stays mounted so the transcript survives view switches (main keeps the conversation) */}
        {sageOn && (
          <div style={{ display: view === 'Sage' ? undefined : 'none' }}>
            <Sage onNavigate={setView} />
          </div>
        )}
        {view === 'Dashboard' ? (
          <Dashboard state={state} onNavigate={setView} />
        ) : view === 'Tracker' ? (
          <Tracker state={state} />
        ) : view === 'Map' ? (
          <MapView state={state} />
        ) : view === 'Journal' ? (
          <JournalView state={state} />
        ) : view === 'Hints' ? (
          <Hints state={state} />
        ) : view === 'Sage' ? null : view === 'Dialogue' ? (
          <Dialogue state={state} />
        ) : view === 'Snapshots' ? (
          <Snapshots />
        ) : view === 'Editor' ? (
          <Editor onNavigate={setView} />
        ) : view === 'Settings' ? (
          <Settings state={state} onState={setState} />
        ) : (
          <>
            <h2>{view}</h2>
            <p className="muted">Coming soon.</p>
          </>
        )}
      </main>
    </div>
  )
}
