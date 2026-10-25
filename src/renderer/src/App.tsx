import { useEffect, useState } from 'react'
import { BattlePanel } from './components/BattlePanel'
import { Welcome } from './components/Welcome'
import { GameSpeed } from './components/GameSpeed'
import { FortunePanel } from './components/FortunePanel'
import type { SettingsInfo } from '@shared/types'
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
import { Spellbook } from './views/Spellbook'
import { Tracker } from './views/Tracker'

const VIEWS = ['Dashboard', 'Tracker', 'Map', 'Journal', 'Hints', 'Spellbook', 'Sage', 'Dialogue', 'Snapshots', 'Editor', 'Settings'] as const
type View = (typeof VIEWS)[number]

export function App() {
  const [view, setView] = useState<View>('Dashboard')
  const [state, setState] = useGameState()
  const [sageOn, setSageOn] = useState(false)
  const [testMode, setTestMode] = useState(false)
  const [info, setInfo] = useState<SettingsInfo | null>(null)
  const [welcome, setWelcome] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [launchMsg, setLaunchMsg] = useState<{ ok: boolean; text: string } | null>(null)
  useEffect(() => {
    const refresh = (): void => {
      window.u4.getSettings().then((s) => {
        setSageOn(s.sageEnabled)
        setTestMode(s.testMode)
        setInfo(s)
      }, () => undefined)
    }
    refresh()
    // first run: the welcome (not in test instances, where scripts drive the views)
    window.u4.getSettings().then((s) => { if (!s.welcomeSeen && !s.testMode) setWelcome(true) }, () => undefined)
    const show = (): void => setWelcome(true)
    window.addEventListener('u4-settings-changed', refresh)
    window.addEventListener('u4-show-welcome', show)
    return () => {
      window.removeEventListener('u4-settings-changed', refresh)
      window.removeEventListener('u4-show-welcome', show)
    }
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
      {welcome && <Welcome state={state} info={info} onClose={() => setWelcome(false)} />}
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
        <GameSpeed />
        <button className="hud-btn pop-btn" onClick={() => void window.u4.toggleHud()}>Pop-out HUD</button>
      </nav>
      <main className="content">
        <FortunePanel />
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
          <>
            {state?.battle && state.party && <BattlePanel battle={state.battle} party={state.party} />}
            <MapView state={state} />
          </>
        ) : view === 'Journal' ? (
          <JournalView state={state} />
        ) : view === 'Hints' ? (
          <Hints state={state} />
        ) : view === 'Spellbook' ? (
          <Spellbook state={state} />
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
