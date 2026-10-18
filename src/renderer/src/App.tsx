import { useEffect, useState } from 'react'
import { useGameState } from './useGameState'
import { Dialogue } from './views/Dialogue'
import { Editor } from './views/Editor'
import { Gallery } from './views/Gallery'
import { Hints } from './views/Hints'
import { JournalView } from './views/Journal'
import { MapView } from './views/Map'
import { Sage } from './views/Sage'
import { Settings } from './views/Settings'
import { Snapshots } from './views/Snapshots'
import { Tracker } from './views/Tracker'

const VIEWS = ['Tracker', 'Map', 'Journal', 'Hints', 'Sage', 'Dialogue', 'Gallery', 'Snapshots', 'Editor', 'Settings'] as const
type View = (typeof VIEWS)[number]

export function App() {
  const [view, setView] = useState<View>('Tracker')
  const [state, setState] = useGameState()
  const [sageOn, setSageOn] = useState(false)
  useEffect(() => {
    const refresh = (): void => {
      window.u4.getSettings().then((s) => setSageOn(s.sageEnabled), () => undefined)
    }
    refresh()
    window.addEventListener('u4-settings-changed', refresh)
    return () => window.removeEventListener('u4-settings-changed', refresh)
  }, [])
  useEffect(() => {
    if (!sageOn && view === 'Sage') setView('Settings')
  }, [sageOn, view])

  return (
    <div className="app">
      <nav className="sidebar">
        <h1>Ultima IV</h1>
        {VIEWS.filter((v) => v !== 'Sage' || sageOn).map((v) => (
          <button key={v} className={v === view ? 'active' : ''} onClick={() => setView(v)}>
            {v}
          </button>
        ))}
        <button className="hud-btn" onClick={() => void window.u4.toggleHud()}>Pop-out HUD</button>
      </nav>
      <main className="content">
        {/* stays mounted so the transcript survives view switches (main keeps the conversation) */}
        {sageOn && (
          <div style={{ display: view === 'Sage' ? undefined : 'none' }}>
            <Sage onNavigate={setView} />
          </div>
        )}
        {view === 'Tracker' ? (
          <Tracker state={state} />
        ) : view === 'Map' ? (
          <MapView state={state} />
        ) : view === 'Journal' ? (
          <JournalView state={state} />
        ) : view === 'Hints' ? (
          <Hints state={state} />
        ) : view === 'Sage' ? null : view === 'Dialogue' ? (
          <Dialogue state={state} />
        ) : view === 'Gallery' ? (
          <Gallery state={state} />
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
