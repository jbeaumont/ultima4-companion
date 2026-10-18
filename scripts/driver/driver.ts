// Headless play-test driver: sends keys to the test DOSBox and reads the game's
// live state from memory, so scripted scenarios run without screenshots.
// Use only with the turbo test profile (see CLAUDE.md, Play-testing).
import { PARTY_SAV_SIZE, parsePartySav } from '../../src/parsers/party'
import type { PartySave } from '../../src/parsers/party'
import { parseUlt } from '../../src/parsers/town'
import { parseWorldMap, WORLD_SIZE } from '../../src/parsers/worldMap'
import { LOCATIONS } from '../../src/domain/constants'
import { findRoute } from '../../src/domain/pathfind'
import type { Dir, Grid } from '../../src/domain/pathfind'
import { looksLikeParty } from '../../src/main/memory/scan'
import { scanProcess } from '../../src/main/memory/memorySource'
import { ProcessReader, dosboxProcesses, isTestDosbox } from '../../src/main/memory/win32'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findDosboxWindow, focusByClick, foregroundTitle, postKey, processHasFocus } from './input'
import type { Key } from './input'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class DriverError extends Error {}

export class GameDriver {
  private reader: ProcessReader | null = null
  private address = 0n
  private grids = new Map<number, Grid>()
  log: (msg: string) => void = (m) => console.log(m)

  private constructor(
    readonly pid: number,
    private readonly gameDir: string,
    private readonly names: string[]
  ) {}

  /** Attach to the running DOSBox (waits for it to appear). */
  static async attach(gameDir: string, names: string[], timeoutMs = 20000): Promise<GameDriver> {
    const until = Date.now() + timeoutMs
    while (Date.now() < until) {
      // only ever drive the test game, even if the player's game is open too
      const pid = (await dosboxProcesses()).find((p) => isTestDosbox(p.commandLine))?.pid
      const hwnd = pid ? findDosboxWindow(pid) : null
      if (pid && hwnd) return new GameDriver(pid, gameDir, names)
      await sleep(250)
    }
    throw new DriverError('No test DOSBox window found')
  }

  /**
   * Send a key. SDL 1.2 only reads keys while DOSBox is the foreground window,
   * so bring it to the front first (one click) if something else is.
   */
  key(k: Key): void {
    const hwnd = this.window()
    if (!processHasFocus(this.pid) && !focusByClick(hwnd)) throw new DriverError(`DOSBox is not in front (foreground: "${foregroundTitle()}")`)
    postKey(hwnd, k)
  }

  /** DOSBox's current visible window (it is recreated when the video mode changes). */
  private window(): unknown {
    const h = findDosboxWindow(this.pid)
    if (!h) throw new DriverError('DOSBox window not found')
    return h
  }

  /** Bring DOSBox to the front, retrying while a just-launched window appears. */
  async focus(timeoutMs = 15000): Promise<void> {
    const until = Date.now() + timeoutMs
    while (Date.now() < until) {
      const h = findDosboxWindow(this.pid)
      if (h && (processHasFocus(this.pid) || focusByClick(h))) return
      await sleep(300)
    }
    throw new DriverError(`Could not bring the DOSBox window to the front (foreground: "${foregroundTitle()}")`)
  }

  /** Whether DOSBox is really the foreground window (informational). */
  inForeground(): boolean {
    return processHasFocus(this.pid)
  }

  /** From the title screen into the game (Journey Onward), then find the party in memory. */
  async journeyOnward(timeoutMs = 20000): Promise<PartySave> {
    await this.focus()
    const until = Date.now() + timeoutMs
    let nudged = 0
    while (Date.now() < until) {
      if (await this.locate()) return this.state()
      // title screen: any key shows the menu, J journeys onward
      if (nudged++ % 4 === 0) {
        this.key('space')
        await sleep(300)
        this.key('j')
      }
      await sleep(500)
    }
    throw new DriverError('The game did not start (party not found in memory)')
  }

  private async locate(): Promise<boolean> {
    this.reader?.close()
    this.reader = ProcessReader.open(this.pid)
    if (!this.reader) throw new DriverError('Cannot read DOSBox memory')
    const found = scanProcess(this.reader, this.names)
    if (!found) return false
    this.address = found.address
    return true
  }

  state(): PartySave {
    const bytes = this.reader?.read(this.address, PARTY_SAV_SIZE)
    if (!bytes || !looksLikeParty(bytes)) throw new DriverError('Lost the party block (did DOSBox restart?)')
    return parsePartySav(bytes)
  }

  /** Press a key and wait until the game has processed a turn (moves or place changed). */
  async press(k: Key, timeoutMs = 2000): Promise<{ before: PartySave; after: PartySave; changed: boolean }> {
    const before = this.state()
    this.key(k)
    const until = Date.now() + timeoutMs
    while (Date.now() < until) {
      await sleep(15)
      const after = this.state()
      if (after.moves !== before.moves || after.x !== before.x || after.y !== before.y || after.location !== before.location) {
        return { before, after, changed: true }
      }
    }
    return { before, after: this.state(), changed: false }
  }

  /** The walkable grid for the current map (world, or the current town). */
  private grid(location: number): Grid {
    const cached = this.grids.get(location)
    if (cached) return cached
    let g: Grid
    if (location === 0) {
      const w = parseWorldMap(new Uint8Array(readFileSync(join(this.gameDir, 'WORLD.MAP'))))
      g = { width: WORLD_SIZE, height: WORLD_SIZE, wrap: true, tileAt: (x, y) => w[y * WORLD_SIZE + x]! }
    } else {
      const file = LOCATIONS[location]?.file
      if (!file?.endsWith('.ULT')) throw new DriverError(`No walking map for location ${location}`)
      const t = parseUlt(new Uint8Array(readFileSync(join(this.gameDir, file)))).tiles
      g = { width: 32, height: 32, wrap: false, tileAt: (x, y) => t[y * 32 + x]! }
    }
    this.grids.set(location, g)
    return g
  }

  /** Walk to (tx, ty) on the current map, re-routing around anything that blocks us. */
  async walkTo(tx: number, ty: number, maxSteps = 400): Promise<PartySave> {
    const blocked = new Map<string, number>() // cell -> step it was blocked at
    for (let step = 0; step < maxSteps; step++) {
      const s = this.state()
      if (s.x === tx && s.y === ty) return s
      for (const [k, at] of blocked) if (step - at > 8) blocked.delete(k) // people move on
      const route = findRoute(this.grid(s.location), s.x, s.y, tx, ty, { blocked: new Set(blocked.keys()) })
      if (!route?.length) throw new DriverError(`No route from ${s.x},${s.y} to ${tx},${ty} in location ${s.location}`)
      const dir: Dir = route[0]!
      const r = await this.press(dir)
      if (r.after.location !== s.location) throw new DriverError(`Left the map while walking (now location ${r.after.location})`)
      if (r.after.x === s.x && r.after.y === s.y) {
        const [dx, dy] = dir === 'up' ? [0, -1] : dir === 'down' ? [0, 1] : dir === 'left' ? [-1, 0] : [1, 0]
        const g = this.grid(s.location)
        const nx = g.wrap ? (s.x + dx + g.width) % g.width : s.x + dx
        const ny = g.wrap ? (s.y + dy + g.height) % g.height : s.y + dy
        blocked.set(`${nx},${ny}`, step)
      }
    }
    throw new DriverError(`Gave up walking to ${tx},${ty}`)
  }

  /** Enter the town/castle/dungeon the party is standing on. */
  async enter(): Promise<PartySave> {
    const r = await this.press('e')
    if (r.after.location === 0) throw new DriverError('Enter did nothing (not standing on an entrance?)')
    return r.after
  }

  async search(): Promise<PartySave> {
    return (await this.press('s')).after
  }

  close(): void {
    this.reader?.close()
  }
}
