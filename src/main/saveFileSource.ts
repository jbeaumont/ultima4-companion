import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import chokidar from 'chokidar'
import { PARTY_SAV_SIZE, parsePartySav } from '@parsers/party'
import type { GameState, StateSource } from '@shared/types'
import { cloudSavePath, pickSavePath, rootSavePath } from './gameLocator'

const DEBOUNCE_MS = 250
const RETRY_MS = 200
const MAX_RETRIES = 10

export type ReadFile = (path: string) => Promise<Uint8Array>

const base = (gameDir: string | null): GameState => ({
  status: 'noGame',
  source: 'saveFile',
  gameDir,
  savePath: null,
  updatedAt: null,
  party: null
})

/** Read and parse one save; never throws, always returns a state. */
export async function readState(
  gameDir: string | null,
  savePath: string | null,
  readFile: ReadFile,
  now: () => number = Date.now
): Promise<GameState> {
  if (!gameDir) return { ...base(null), message: 'Ultima IV install not found. Choose the game folder in Settings.' }
  if (!savePath) return { ...base(gameDir), status: 'noSave', message: 'No PARTY.SAV found in the game folder.' }
  let buf: Uint8Array
  try {
    buf = await readFile(savePath)
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { ...base(gameDir), status: 'noSave', savePath, message: 'PARTY.SAV disappeared.' }
    return { ...base(gameDir), status: 'error', savePath, message: `Could not read PARTY.SAV: ${(e as Error).message}` }
  }
  if (buf.length < PARTY_SAV_SIZE) {
    return {
      ...base(gameDir),
      status: 'error',
      savePath,
      message: `PARTY.SAV is incomplete (${buf.length} of ${PARTY_SAV_SIZE} bytes); the game may be mid-write.`
    }
  }
  try {
    return { ...base(gameDir), status: 'ok', savePath, updatedAt: now(), party: parsePartySav(buf) }
  } catch (e) {
    return { ...base(gameDir), status: 'error', savePath, message: `Could not parse PARTY.SAV: ${(e as Error).message}` }
  }
}

/** True when the state looks like a half-written file worth retrying. */
export const isPartial = (s: GameState): boolean => s.status === 'error' && /incomplete/.test(s.message ?? '')

export class SaveFileSource implements StateSource {
  private watcher: ReturnType<typeof chokidar.watch> | null = null
  private timer: NodeJS.Timeout | null = null
  private stopped = false
  private onState: (s: GameState) => void = () => {}
  private last: GameState | null = null

  constructor(private readonly gameDir: string | null) {
    // first state arrives from refresh()
  }

  start(onState: (state: GameState) => void): void {
    this.onState = onState
    this.stopped = false
    void this.refresh()
    if (!this.gameDir) return
    const saves = [cloudSavePath(this.gameDir), rootSavePath(this.gameDir)]
    const dirs = [join(this.gameDir, 'cloud_saves')]
    this.watcher = chokidar.watch([...saves, ...dirs], {
      ignoreInitial: true,
      depth: 0
    })
    this.watcher.on('all', () => this.schedule(DEBOUNCE_MS))
    this.watcher.on('error', (e) => this.emit({ ...base(this.gameDir), status: 'error', message: `Watcher error: ${(e as Error).message}` }))
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    await this.watcher?.close()
    this.watcher = null
  }

  getState(): GameState | null {
    return this.last
  }

  private emit(s: GameState): void {
    if (this.stopped) return
    this.last = s
    this.onState(s)
  }

  private schedule(ms: number, attempt = 0): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.refresh(attempt), ms)
  }

  private async refresh(attempt = 0): Promise<void> {
    const savePath = pickSavePath(this.gameDir, existsSync)
    const state = await readState(this.gameDir, savePath, async (p) => {
      await stat(p)
      return new Uint8Array(await readFile(p))
    })
    if (isPartial(state) && attempt < MAX_RETRIES) return this.schedule(RETRY_MS, attempt + 1)
    this.emit(state)
  }
}
