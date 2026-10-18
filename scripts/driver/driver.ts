// Headless play-test driver: sends keys to the test DOSBox and reads the game's
// live state from memory, so scripted scenarios run without screenshots.
// Use only with the turbo test profile (see CLAUDE.md, Play-testing).
import { PARTY_SAV_SIZE, parsePartySav } from '../../src/parsers/party'
import type { PartySave } from '../../src/parsers/party'
import { parseWorldMap, WORLD_SIZE } from '../../src/parsers/worldMap'
import { findRoute } from '../../src/domain/pathfind'
import { stepCost } from '../../src/domain/walkable'
import type { Dir, Grid } from '../../src/domain/pathfind'
import { planCombatTurn, weaponReach } from '../../src/domain/combatPlan'
import { BATTLE_DS, parseBattle } from '../../src/parsers/battle'
import type { BattleMonster } from '../../src/parsers/battle'
import type { CombatAction, CombatView } from '../../src/domain/combatPlan'
import { DNG_SIZE, dungeonRoute, stepKeys } from '../../src/domain/dungeonRoute'
import { looksLikeParty } from '../../src/main/memory/scan'
import { scanProcess } from '../../src/main/memory/memorySource'
import { ProcessReader, dosboxProcesses, isTestDosbox } from '../../src/main/memory/win32'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findDosboxWindow, focusByClick, foregroundTitle, postKey, processHasFocus } from './input'
import type { Key } from './input'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Game globals as offsets in the data segment (u4-decompiled U4.H). The party
// block found in memory is `Party` at DS:9144, which gives the segment base.
const DS = {
  ...BATTLE_DS,
  dungeonMap: 0x8742, // D_8742._map: x8x8x8[z][y][x] in a dungeon, x32x32 in a town
  activeCharaX: 0x080a, // -1 except while a member's command is being taken
  roomExitX: 0x96ee,
  roomExitY: 0x96f4
}
export const MODE = { vision: 0, outdoors: 1, building: 2, dungeon: 3, combat: 4, camp: 5, room: 6, shrine: 7 } as const
const inBattle = (mode: number) => mode >= MODE.combat && mode <= MODE.room

export interface Battle {
  mode: number
  /** Index of the member whose command the game is waiting for, or null. */
  awaiting: number | null
  view: CombatView
  /** Live monsters with their HP. */
  monsters: BattleMonster[]
}

export interface BattleResult {
  turns: number
  outcome: 'won' | 'left' | 'lost' | 'timeout'
  log: string[]
}

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
      if (
        after.moves !== before.moves || after.x !== before.x || after.y !== before.y || after.location !== before.location ||
        after.orientation !== before.orientation || after.dungeonLevel !== before.dungeonLevel || this.inBattle()
      ) {
        return { before, after, changed: true }
      }
    }
    return { before, after: this.state(), changed: false }
  }

  /** The walkable grid for the current map: the world, or the town map the game has loaded (any floor, doors as they are now). */
  private grid(location: number): Grid {
    if (location !== 0) {
      const t = this.ds(DS.dungeonMap, 32 * 32) // D_8742._map.x32x32 while in a town or castle
      return { width: 32, height: 32, wrap: false, tileAt: (x, y) => t[y * 32 + x]! }
    }
    const cached = this.grids.get(0)
    if (cached) return cached
    const w = parseWorldMap(new Uint8Array(readFileSync(join(this.gameDir, 'WORLD.MAP'))))
    const g: Grid = { width: WORLD_SIZE, height: WORLD_SIZE, wrap: true, tileAt: (x, y) => w[y * WORLD_SIZE + x]! }
    this.grids.set(0, g)
    return g
  }

  /** Walk to (tx, ty) on the current map, re-routing around anything that blocks us. */
  async walkTo(tx: number, ty: number, maxSteps = 400): Promise<PartySave> {
    const blocked = new Map<string, number>() // cell -> step it was blocked at
    const fails = new Map<string, number>() // consecutive refused steps per cell
    for (let step = 0; step < maxSteps; step++) {
      const s = this.state()
      if (s.x === tx && s.y === ty) return s
      for (const [k, at] of blocked) if (step - at > 8) blocked.delete(k) // people move on
      let route = findRoute(this.grid(s.location), s.x, s.y, tx, ty, { blocked: new Set(blocked.keys()) })
      if (!route?.length && blocked.size) {
        // whatever blocked us (a monster, a person) has probably moved: forget it and try again
        blocked.clear()
        route = findRoute(this.grid(s.location), s.x, s.y, tx, ty)
      }
      if (!route?.length) throw new DriverError(`No route from ${s.x},${s.y} to ${tx},${ty} in location ${s.location} (avoiding ${[...blocked.keys()].join(" ") || "nothing"})`)
      const dir: Dir = route[0]!
      const r = await this.press(dir)
      if (r.after.location !== s.location) throw new DriverError(`Left the map while walking (now location ${r.after.location})`)
      if (r.after.x === s.x && r.after.y === s.y) {
        const [dx, dy] = dir === 'up' ? [0, -1] : dir === 'down' ? [0, 1] : dir === 'left' ? [-1, 0] : [1, 0]
        const g = this.grid(s.location)
        const nx = g.wrap ? (s.x + dx + g.width) % g.width : s.x + dx
        const ny = g.wrap ? (s.y + dy + g.height) % g.height : s.y + dy
        // slow ground (brush, forest, hills, swamp) refuses steps at random: retry before routing around it
        const k = `${nx},${ny}`
        const tries = (fails.get(k) ?? 0) + 1
        fails.set(k, tries)
        if ((stepCost(g.tileAt(nx, ny)) ?? 1) <= 1 || tries >= 4) blocked.set(k, step)
      } else {
        fails.clear()
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

  /** Type a line of text (letters and digits) and press Enter, for prompts that read a word. */
  async type(text: string, enter = true): Promise<void> {
    for (const ch of text.toLowerCase()) {
      this.key(ch === ' ' ? 'space' : ch)
      await sleep(40)
    }
    if (enter) this.key('enter')
    await sleep(100)
  }

  /** Wait until `test` holds for the live party state. */
  async waitFor(test: (s: PartySave) => boolean, timeoutMs: number, what = 'condition'): Promise<PartySave> {
    const until = Date.now() + timeoutMs
    while (Date.now() < until) {
      const s = this.state()
      if (test(s)) return s
      await sleep(50)
    }
    throw new DriverError(`Timed out waiting for ${what}`)
  }

  async search(): Promise<PartySave> {
    return (await this.press('s')).after
  }

  // ---- raw globals -------------------------------------------------------

  private ds(offset: number, size: number): Uint8Array {
    const b = this.reader?.read(this.address - BigInt(DS.party) + BigInt(offset), size)
    if (!b) throw new DriverError('Cannot read game memory')
    return b
  }

  private i16(offset: number): number {
    const b = this.ds(offset, 2)
    return ((b[0]! | (b[1]! << 8)) << 16) >> 16
  }

  /** The game's current mode (MODE.*). */
  mode(): number {
    return this.i16(DS.curMode)
  }

  inBattle(): boolean {
    return inBattle(this.mode())
  }

  // ---- battles ------------------------------------------------------------

  /** Snapshot of the battle in progress. */
  battle(): Battle {
    const mode = this.mode()
    const state = parseBattle(mode, this.ds(DS.combat, BATTLE_DS.combatSize), this.ds(DS.fighters, BATTLE_DS.fightersSize), this.i16(DS.activeChara))
    const party = state.party.map((p) => (p ? { x: p.x, y: p.y } : null))
    const active = state.active
    const awaiting = this.i16(DS.activeCharaX) !== -1 && active >= 0 && active < 8 && party[active] ? active : null
    const ex = this.i16(DS.roomExitX) & 0xff
    const ey = this.i16(DS.roomExitY) & 0xff
    const side = (v: number) => (v === 0xff ? -1 : v)
    const exit = ex ? { x: side(ex) } : ey ? { y: side(ey) } : null
    const me = awaiting ?? 0
    return {
      mode,
      awaiting,
      monsters: state.monsters,
      view: {
        map: Uint8Array.from(state.map),
        monsters: state.monsters,
        party,
        me,
        reach: weaponReach(this.state().members[me]?.weapon ?? 0),
        room: state.room,
        exit
      }
    }
  }

  /** Wait until the game asks a member for a command (null once the battle is over). */
  private async awaitPrompt(timeoutMs: number): Promise<Battle | null> {
    const until = Date.now() + timeoutMs
    while (Date.now() < until) {
      if (!this.inBattle()) return null
      const b = this.battle()
      if (b.awaiting !== null) return b
      await sleep(15)
    }
    throw new DriverError('Battle stalled: no command prompt')
  }

  private async act(a: CombatAction): Promise<void> {
    if (a.kind === 'pass') this.key('space')
    else if (a.kind === 'move') this.key(a.dir)
    else {
      this.key('a')
      await sleep(40)
      this.key(a.dir)
    }
  }

  /**
   * Fight the battle in progress to its end: each member attacks a monster in
   * reach or closes in, and once none remain (or with 'flee') walks off the
   * map. In a dungeon room that is the only way the battle ends.
   */
  async fightBattle(opts: { goal?: 'fight' | 'flee'; maxTurns?: number; exitToward?: Dir } = {}): Promise<BattleResult> {
    const log: string[] = []
    const start = this.state()
    let turns = 0
    for (; turns < (opts.maxTurns ?? 300); turns++) {
      const b = await this.awaitPrompt(30000)
      if (!b) break
      const me = b.awaiting!
      const action = planCombatTurn({ ...b.view, prefer: opts.exitToward }, opts.goal ?? 'fight')
      const at = b.view.party[me]!
      log.push(`${start.members[me]?.name ?? me}@${at.x},${at.y} ${action.kind}${action.kind === 'pass' ? '' : ' ' + action.dir} (${b.monsters.length} monsters)`)
      await this.act(action)
      // the member's command is done when the prompt clears or passes to someone else
      const until = Date.now() + 5000
      while (Date.now() < until) {
        await sleep(15)
        if (!this.inBattle()) break
        if (this.i16(DS.activeCharaX) === -1 || this.i16(DS.activeChara) !== me) break
      }
    }
    if (this.inBattle()) return { turns, outcome: 'timeout', log }
    const end = this.state()
    const alive = end.members.some((m) => m.status === 'G' || m.status === 'P')
    return { turns, outcome: !alive ? 'lost' : opts.goal === 'flee' ? 'left' : 'won', log }
  }

  // ---- dungeons -----------------------------------------------------------

  /** The live layout of the current dungeon level (64 raw cells, row-major). */
  dungeonLevel(): Uint8Array {
    const s = this.state()
    if (s.dungeonLevel > 7) throw new DriverError('Not in a dungeon')
    return this.ds(DS.dungeonMap + s.dungeonLevel * DNG_SIZE * DNG_SIZE, DNG_SIZE * DNG_SIZE)
  }

  /** Raw cell under the party. */
  dungeonCell(): number {
    const s = this.state()
    return this.dungeonLevel()[s.y * DNG_SIZE + s.x]!
  }

  /**
   * Walk to (tx, ty) on the current dungeon level by turning and advancing.
   * Battles on the way are fought with fightBattle(), or end the walk with `stopOnBattle`.
   */
  async dungeonWalkTo(
    tx: number,
    ty: number,
    opts: { throughRooms?: boolean; stopOnBattle?: boolean; maxSteps?: number; onBattle?: (r: BattleResult) => void } = {}
  ): Promise<PartySave> {
    const level0 = this.state().dungeonLevel
    let onward: Dir | undefined // where the route goes after the cell we just stepped into
    for (let step = 0; step < (opts.maxSteps ?? 200); step++) {
      if (this.inBattle()) {
        if (opts.stopOnBattle) return this.state()
        // a room is left by walking off its edge: leave on the side the route continues
        const r = await this.fightBattle({ exitToward: onward })
        opts.onBattle?.(r)
        if (r.outcome !== 'won') throw new DriverError(`Battle ${r.outcome} on the way to ${tx},${ty}`)
        continue
      }
      const s = this.state()
      if (s.dungeonLevel !== level0) throw new DriverError(`Changed level while walking (now L${s.dungeonLevel + 1})`)
      if (s.x === tx && s.y === ty) return s
      // rooms mean a battle each time, so only go through one when there is no other way
      const level = this.dungeonLevel()
      const route = dungeonRoute(level, s.x, s.y, tx, ty, opts.throughRooms) ?? dungeonRoute(level, s.x, s.y, tx, ty, true)
      onward = route && route.length > 1 ? (['left', 'up', 'right', 'down'] as const)[route[1]!] : undefined
      if (!route?.length) throw new DriverError(`No dungeon route from ${s.x},${s.y} to ${tx},${ty} on L${s.dungeonLevel + 1}`)
      for (const k of stepKeys(s.orientation, route[0]!)) {
        await this.press(k)
        if (this.inBattle()) break
      }
    }
    throw new DriverError(`Gave up walking to ${tx},${ty}`)
  }

  /** Climb (K) or descend (D) the ladder the party stands on. */
  async ladder(dir: 'up' | 'down'): Promise<PartySave> {
    const r = await this.press(dir === 'up' ? 'k' : 'd')
    if (r.after.dungeonLevel === r.before.dungeonLevel && r.after.location === r.before.location) {
      throw new DriverError(`No ladder ${dir} at ${r.before.x},${r.before.y}`)
    }
    return r.after
  }

  close(): void {
    this.reader?.close()
  }
}
