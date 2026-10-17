import { BrowserWindow, dialog, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { IPC } from '@shared/types'
import type { GameState, SettingsInfo } from '@shared/types'
import { isGameDir, locateGameDir, pickSavePath } from './gameLocator'
import { SaveFileSource } from './saveFileSource'
import { loadSettings, saveSettings } from './store'

let source: SaveFileSource | null = null
let gameDir: string | null = null

const broadcast = (state: GameState): void => {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(IPC.stateChanged, state)
}

async function startSource(): Promise<void> {
  await source?.stop()
  gameDir = await locateGameDir(loadSettings().gameDir)
  source = new SaveFileSource(gameDir)
  source.start(broadcast)
}

export async function setupIpc(): Promise<void> {
  ipcMain.handle(IPC.getState, (): GameState | null => source?.getState() ?? null)

  ipcMain.handle(IPC.getSettings, (): SettingsInfo => ({
    gameDir,
    savePath: pickSavePath(gameDir, existsSync),
    override: loadSettings().gameDir ?? null
  }))

  ipcMain.handle(IPC.chooseDir, async (e): Promise<GameState | null> => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const opts = { title: 'Choose the Ultima IV folder', properties: ['openDirectory' as const] }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    const dir = res.filePaths[0]
    if (res.canceled || !dir) return source?.getState() ?? null
    if (!isGameDir(dir, existsSync)) {
      await dialog.showMessageBox({ type: 'warning', message: 'That folder does not contain WORLD.MAP, so it is not an Ultima IV install.' })
      return source?.getState() ?? null
    }
    saveSettings({ gameDir: dir })
    await startSource()
    return source?.getState() ?? null
  })

  await startSource()
}
