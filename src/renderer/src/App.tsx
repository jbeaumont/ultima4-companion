import { useState } from 'react'
import { useGameState } from './useGameState'
import { Settings } from './views/Settings'
import { Tracker } from './views/Tracker'

const VIEWS = ['Tracker', 'Map', 'Journal', 'Hints', 'Dialogue', 'Settings'] as const
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
      </nav>
      <main className="content">
        {view === 'Tracker' ? (
          <Tracker state={state} />
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
