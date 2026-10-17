import { join } from 'node:path'
import { BrowserWindow, screen } from 'electron'
import { loadSettings, saveSettings } from './store'

let hud: BrowserWindow | null = null

/** Saved position only counts while it still lands on a connected display. */
function startBounds(): Electron.Rectangle | { width: number; height: number } {
  const b = loadSettings().hudBounds
  if (!b) return { width: 380, height: 190 }
  if (b.x === undefined || b.y === undefined) return { width: b.width, height: b.height }
  const r = { x: b.x, y: b.y, width: b.width, height: b.height }
  const wa = screen.getDisplayMatching(r).workArea
  const visible = r.x < wa.x + wa.width - 40 && r.x + r.width > wa.x + 40 && r.y >= wa.y - 10 && r.y < wa.y + wa.height - 40
  return visible ? r : { width: b.width, height: b.height }
}

function createHud(): BrowserWindow {
  const win = new BrowserWindow({
    ...startBounds(),
    minWidth: 240,
    minHeight: 120,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    title: 'Ultima IV HUD',
    backgroundColor: '#0b0b14',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  let timer: NodeJS.Timeout | null = null
  const persist = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      if (!win.isDestroyed() && !win.isMinimized()) saveSettings({ hudBounds: win.getBounds() })
    }, 400)
  }
  win.on('resize', persist)
  win.on('move', persist)
  win.on('close', () => {
    if (timer) clearTimeout(timer)
    if (!win.isMinimized()) saveSettings({ hudBounds: win.getBounds() })
  })
  win.on('closed', () => {
    hud = null
  })

  const url = process.env['ELECTRON_RENDERER_URL']
  if (url) win.loadURL(`${url}#hud`)
  else win.loadFile(join(import.meta.dirname, '../renderer/index.html'), { hash: 'hud' })
  return win
}

/** Open the HUD, or close it when already open; resolves to whether it is open now. */
export function toggleHud(): boolean {
  if (hud && !hud.isDestroyed()) {
    hud.close()
    return false
  }
  hud = createHud()
  return true
}

export function closeHud(): void {
  if (hud && !hud.isDestroyed()) hud.close()
}
