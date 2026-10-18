import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { Hud } from './Hud'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {location.hash === '#hud' ? <Hud /> : <App />}
  </StrictMode>
)
