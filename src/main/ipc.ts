import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { LOCATIONS } from '@domain/constants'
import { LZW_IMAGES, RLE_IMAGES } from '@parsers/egaImage'
import { IPC } from '@shared/types'
import type { BaseAssets, GameState, LocationAssets, SettingsInfo } from '@shared/types'
import { isGameDir, locateGameDir, pickSavePath } from './gameLocator'
import { getExplored, loadExplored, resetExplored, trackExplored } from './explored'
import { toggleHud } from './hud'
import { loadJournal, recordJournalVisit, saveJournal } from './journal'
import { HybridSource } from './hybridSource'
import { setupSavesIpc } from './saves/savesIpc'
import { setupSageIpc } from './sage/sageIpc'
import { SnapshotStore } from './saves/snapshots'
import { loadSettings, saveSettings } from './store'

let source: HybridSource | null = null
let gameDir: string | null = null
let autoSnapshot: (s: GameState) => void = () => {}

const send = (channel: string, payload: unknown): void => {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(channel, payload)
}

// settlement visits are recorded here so they count even when the Dialogue view is closed
const onState = (state: GameState): void => {
  send(IPC.stateChanged, state)
  trackExplored(state.party)
  const loc = state.party?.location
  if (loc === undefined || loc < 1 || loc > 16) return
  recordJournalVisit(loc).then((j) => j && send(IPC.journalChanged, j), () => undefined)
}

async function startSource(): Promise<void> {
  await source?.stop()
  gameDir = await locateGameDir(loadSettings().gameDir)
  source = new HybridSource(gameDir, loadSettings().liveMemory !== false, (s) => autoSnapshot(s))
  source.start(onState)
}

const readAll = async (dir: string, files: Record<string, string>): Promise<Record<string, Uint8Array>> => {
  const out: Record<string, Uint8Array> = {}
  for (const [role, name] of Object.entries(files)) out[role] = new Uint8Array(await readFile(join(dir, name)))
  return out
}

export async function setupIpc(): Promise<void> {
  ipcMain.handle(IPC.getState, (): GameState | null => source?.getState() ?? null)

  ipcMain.handle(IPC.getSettings, (): SettingsInfo => ({
    gameDir,
    savePath: pickSavePath(gameDir, existsSync),
    override: loadSettings().gameDir ?? null,
    liveMemory: loadSettings().liveMemory !== false,
    attachedPid: source?.attachment()?.pid ?? null,
    editorEnabled: loadSettings().editorEnabled === true
  }))

  ipcMain.handle(IPC.setLiveMemory, async (_e, on: unknown): Promise<GameState | null> => {
    saveSettings({ liveMemory: on === true })
    await startSource()
    return source?.getState() ?? null
  })

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

  // read-only; file names come from LOCATIONS, never from the renderer
  ipcMain.handle(IPC.assetsBase, async (): Promise<BaseAssets | null> => {
    if (!gameDir) return null
    try {
      const f = await readAll(gameDir, { shapes: 'SHAPES.EGA', world: 'WORLD.MAP' })
      return { shapes: f.shapes!, world: f.world! }
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.assetsLocation, async (_e, id: unknown): Promise<LocationAssets | null> => {
    const loc = typeof id === 'number' ? LOCATIONS[id] : undefined
    if (!gameDir || !loc || !loc.file || loc.kind === 'shrine') return null
    const names: Record<string, string> = loc.kind === 'dungeon' ? { dng: loc.file } : { ult: loc.file }
    if (loc.upperFloor) names.ult2 = loc.upperFloor
    if (loc.talk) names.tlk = loc.talk
    try {
      return { kind: loc.kind, files: await readAll(gameDir, names) }
    } catch {
      return null
    }
  })

  // read-only; only whitelisted image names ever reach the filesystem
  const imageNames = new Set<string>([...RLE_IMAGES, ...LZW_IMAGES])
  ipcMain.handle(IPC.assetsImage, async (_e, name: unknown): Promise<Uint8Array | null> => {
    if (!gameDir || typeof name !== 'string' || !imageNames.has(name)) return null
    try {
      return new Uint8Array(await readFile(join(gameDir, name)))
    } catch {
      return null
    }
  })

  // live dungeon working copy: the cloud_saves overlay wins, as with PARTY.SAV
  ipcMain.handle(IPC.assetsDngmap, async (): Promise<Uint8Array | null> => {
    if (!gameDir) return null
    for (const p of [join(gameDir, 'cloud_saves', 'DNGMAP.SAV'), join(gameDir, 'DNGMAP.SAV')]) {
      if (!existsSync(p)) continue
      try {
        return new Uint8Array(await readFile(p))
      } catch {
        return null
      }
    }
    return null
  })

  ipcMain.handle(IPC.exploredGet, (): Uint8Array => getExplored())
  ipcMain.handle(IPC.exploredReset, (): Uint8Array => resetExplored())
  ipcMain.handle(IPC.hudToggle, (): boolean => toggleHud())

  ipcMain.handle(IPC.journalGet, () => loadJournal())
  ipcMain.handle(IPC.journalSave, (_e, j: unknown) => saveJournal(j))

  setupSageIpc(join(app.getPath('userData'), 'sage-key.bin'), () => source?.getState() ?? null, send)
  autoSnapshot = setupSavesIpc(new SnapshotStore(join(app.getPath('userData'), 'snapshots')), () => gameDir, send).autoSnapshot

  await loadExplored((bits) => send(IPC.exploredChanged, bits))
  await startSource()
}
