import { useState } from 'react'

const VIEWS = ['Tracker', 'Map', 'Journal', 'Hints', 'Dialogue', 'Settings'] as const
type View = (typeof VIEWS)[number]

export function App() {
  const [view, setView] = useState<View>('Tracker')

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
        <h2>{view}</h2>
        <p className="muted">Coming soon.</p>
      </main>
    </div>
  )
}
