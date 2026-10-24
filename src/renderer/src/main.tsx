import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Hud } from './Hud'
// shared styles first; each area has its own file (see styles/base.css)
import './styles/base.css'
import './styles/battle.css'
import './styles/dashboard.css'
import './styles/dialogue.css'
import './styles/editor.css'
import './styles/hints.css'
import './styles/hud.css'
import './styles/journal.css'
import './styles/map.css'
import './styles/sage.css'
import './styles/settings.css'
import './styles/snapshots.css'
import './styles/tracker.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.hash === '#hud' ? <Hud /> : <App />}
  </StrictMode>
)
