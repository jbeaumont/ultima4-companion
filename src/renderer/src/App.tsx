import { useState } from 'react'
import { useGameState } from './useGameState'
import { Dialogue } from './views/Dialogue'
import { Editor } from './views/Editor'
import { Hints } from './views/Hints'
import { JournalView } from './views/Journal'
import { MapView } from './views/Map'
import { Settings } from './views/Settings'
import { Snapshots } from './views/Snapshots'
import { Tracker } from './views/Tracker'

const VIEWS = ['Tracker', 'Map', 'Journal', 'Hints', 'Dialogue', 'Snapshots', 'Editor', 'Settings'] as const
type View = (typeof VIEWS)[number]

export function App() {
  const [view, setView] = useState<View>('Tracker')
  const [state, setState] = useGameState()

  return (
    <div className="app">
      <nav className="sidebar">
        <h1>Ultima IV</h1>
        {VIEWS.map((v) => (
          <button key={v} className={v === view ? 'active' : ''} onClick={() => setView(v)}>
            {v}
          </button>
        ))}
        <button className="hud-btn" onClick={() => void window.u4.toggleHud()}>Pop-out HUD</button>
      </nav>
      <main className="content">
        {view === 'Tracker' ? (
          <Tracker state={state} />
        ) : view === 'Map' ? (
          <MapView state={state} />
        ) : view === 'Journal' ? (
          <JournalView state={state} />
        ) : view === 'Hints' ? (
          <Hints state={state} />
        ) : view === 'Dialogue' ? (
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
