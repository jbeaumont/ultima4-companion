// Headless play-test driver: sends keys to the test DOSBox and reads the game's
// live state from memory, so scripted scenarios run without screenshots.
// Use only with the turbo test profile (see CLAUDE.md, Play-testing).
import { PARTY_SAV_SIZE, parsePartySav } from '../../src/parsers/party'
import type { PartySave } from '../../src/parsers/party'
import { parseWorldMap, WORLD_SIZE } from '../../src/parsers/worldMap'
import { findRoute } from '../../src/domain/pathfind'
import { stepCost } from '../../src/domain/walkable'
import type { Dir, Grid } from '../../src/domain/pathfind'
import { SPELL_CAST, combatWalkable, planCombatTurn, weaponReach } from '../../src/domain/combatPlan'
import { BATTLE_DS, parseBattle } from '../../src/parsers/battle'
import type { BattleMonster } from '../../src/parsers/battle'
import type { CombatAction, CombatView, Point } from '../../src/domain/combatPlan'
import { DNG_SIZE, ENERGY_FIELD, dungeonPath, dungeonPlan, roomExits, stepDir, stepKeys } from '../../src/domain/dungeonRoute'
import { parseDng } from '../../src/parsers/dungeon'
import { LOCATIONS } from '../../src/domain/constants'
import { looksLikeParty } from '../../src/main/memory/scan'
import { scanProcess } from '../../src/main/memory/memorySource'
import { ProcessReader, dosboxProcesses, isTestDosbox } from '../../src/main/memory/win32'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findDosboxWindow, focusByClick, foregroundTitle, postKey, processHasFocus } from './input'
import type { Key } from './input'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const DOOR = 59 // unlocked door; 58 is locked and needs a key
const STALL_TURNS = 40 // turns without a monster falling before a room battle gives up on the rest
const DNG_DELTA = [[-1, 0], [0, -1], [1, 0], [0, 1]] as const // dungeon directions W, N, E, S

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
  private dng: { location: number; data: ReturnType<typeof parseDng> } | null = null
  log: (msg: string) => void = (m) => console.log(m)
  /** Log every walking step that doesn't simply succeed (for diagnosing slow walks). */
  trace = false

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
      const [dx, dy] = dir === 'up' ? [0, -1] : dir === 'down' ? [0, 1] : dir === 'left' ? [-1, 0] : [1, 0]
      const g = this.grid(s.location)
      const nx = g.wrap ? (s.x + dx + g.width) % g.width : s.x + dx
      const ny = g.wrap ? (s.y + dy + g.height) % g.height : s.y + dy
      if (s.location !== 0 && g.tileAt(nx, ny) === DOOR) {
        // the game opens doors with O, and only to the east or west (U4_EXPLO.C CMD_Open)
        if (dy !== 0) {
          blocked.set(`${nx},${ny}`, step)
          continue
        }
        await this.press('o', 300)
        await this.press(dir, 300)
      }
      const t0 = Date.now()
      const r = await this.press(dir)
      if (this.trace && (r.after.x === s.x && r.after.y === s.y)) this.log(`  ${s.x},${s.y} ${dir}: refused after ${Date.now() - t0} ms`)
      // poison and starvation keep hurting while you walk; a dead Avatar wakes at Lord British's after a long sequence
      if (r.after.allRecords[0]?.status === 'D') throw new DriverError(`The Avatar died while walking (at ${s.x},${s.y})`)
      if (r.after.location !== s.location) throw new DriverError(`Left the map while walking (now location ${r.after.location})`)
      if (r.after.x === s.x && r.after.y === s.y) {
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
    const party0 = this.state()
    return {
      mode,
      awaiting,
      monsters: state.monsters,
      view: {
        map: Uint8Array.from(state.map),
        monsters: state.monsters,
        party,
        me,
        reach: weaponReach(party0.members[me]?.weapon ?? 0),
        support: { members: party0.members, mp: party0.members[me]?.mp ?? 0, mixtures: party0.mixtures },
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
    else if (a.kind === 'attack') {
      this.key('a')
      await sleep(40)
      this.key(a.dir)
    } else {
      // C, spell letter, then the member's number or a direction (U4_SPELL.C)
      this.key('c')
      await sleep(120)
      this.key(SPELL_CAST[a.spell].letter)
      await sleep(120)
      this.key(a.who !== undefined ? String(a.who + 1) : a.dir!)
    }
  }

  /**
   * Fight the battle in progress to its end: each member attacks a monster in
   * reach or closes in, and once none remain (or with 'flee') walks off the
   * map. In a dungeon room that is the only way the battle ends.
   */
  async fightBattle(opts: { goal?: 'fight' | 'flee'; maxTurns?: number; exitToward?: Dir; exitFor?: () => Dir | undefined } = {}): Promise<BattleResult> {
    const log: string[] = []
    const start = this.state()
    const limit = opts.maxTurns ?? 300 // per battle: walking from one room into the next starts a new one
    let turns = 0
    let total = 0
    let room = -1
    let triggers: Point[] = []
    const stepped = new Set<string>()
    let lastCount = -1
    let sinceProgress = 0
    let exitToward = opts.exitToward
    for (; turns < limit; turns++, total++) {
      const b = await this.awaitPrompt(30000)
      if (!b) break
      // a new room (the party walked from one room into the next): its own triggers, a fresh count
      const cell = this.mode() === MODE.room ? this.dungeonCell() : -1
      if (cell !== room) {
        room = cell
        // rooms can open into rooms: each one is left on the side the route goes on from it
        if (opts.exitFor) exitToward = opts.exitFor() ?? exitToward
        triggers = this.roomTriggers()
        stepped.clear()
        turns = 0
        sinceProgress = 0
      }
      if (b.monsters.length !== lastCount) {
        if (lastCount === 0 && b.monsters.length > 0) turns = 0 // another battle began
        lastCount = b.monsters.length
        sinceProgress = 0
      } else sinceProgress++
      const me = b.awaiting!
      for (const p of b.view.party) if (p) stepped.add(`${p.x},${p.y}`)
      const open = triggers.filter((t) => !stepped.has(`${t.x},${t.y}`))
      // monsters walled off in a room can't be reached or hit: after a while, leave instead of waiting forever
      const stalled = b.view.room && b.monsters.length > 0 && sinceProgress > STALL_TURNS
      const goal = stalled ? 'flee' : opts.goal ?? 'fight'
      const action = planCombatTurn({ ...b.view, prefer: exitToward, triggers: open }, goal)
      const at = b.view.party[me]!
      const what = action.kind === 'pass' ? '' : action.kind === 'cast' ? ` ${action.spell} ${action.who !== undefined ? `on ${start.members[action.who]?.name}` : action.dir}` : ` ${action.dir}`
      log.push(`${start.members[me]?.name ?? me}@${at.x},${at.y} ${action.kind}${what} (${b.monsters.length} monsters${stalled ? ', leaving: none reachable' : ''})`)
      await this.act(action)
      // the member's command is done when the prompt clears or passes to someone else
      const until = Date.now() + 5000
      while (Date.now() < until) {
        await sleep(15)
        if (!this.inBattle()) break
        if (this.i16(DS.activeCharaX) === -1 || this.i16(DS.activeChara) !== me) break
      }
    }
    if (this.inBattle()) return { turns: total, outcome: 'timeout', log }
    const end = this.state()
    const alive = end.members.some((m) => m.status === 'G' || m.status === 'P')
    return { turns: total, outcome: !alive ? 'lost' : opts.goal === 'flee' ? 'left' : 'won', log }
  }


  // ---- dungeons -----------------------------------------------------------

  /** The current dungeon's file data (levels and rooms). */
  private dungeonFile(): ReturnType<typeof parseDng> {
    const loc = this.state().location
    if (this.dng?.location !== loc) {
      const file = LOCATIONS[loc]?.file
      if (!file?.endsWith('.DNG')) throw new DriverError('Not in a dungeon')
      this.dng = { location: loc, data: parseDng(new Uint8Array(readFileSync(join(this.gameDir, file)))) }
    }
    return this.dng.data
  }

  /** Sides each room of this dungeon can be left by (openings and trigger-opened edges). */
  private roomSides(): (room: number) => Set<number> {
    const sides = this.dungeonFile().rooms.map((r) => roomExits(r, combatWalkable))
    return (room) => sides[room] ?? new Set([0, 1, 2, 3])
  }

  /** Trigger cells of the dungeon room the party is fighting in (none outside rooms). */
  private roomTriggers(): Point[] {
    if (this.mode() !== MODE.room) return []
    const room = this.dungeonFile().rooms[this.dungeonCell() & 0x0f]
    return room?.triggers.map((t) => ({ x: t.x, y: t.y })) ?? []
  }

  /** The live layout of the current dungeon level (64 raw cells, row-major). */
  dungeonLevel(): Uint8Array {
    const s = this.state()
    if (s.dungeonLevel > 7) throw new DriverError('Not in a dungeon')
    return this.ds(DS.dungeonMap + s.dungeonLevel * DNG_SIZE * DNG_SIZE, DNG_SIZE * DNG_SIZE)
  }

  /** People and creatures on the current town map (D_8742._npc, U4.H struct tNPC). */
  npcs(): { slot: number; tile: number; x: number; y: number; talk: number }[] {
    const n = this.ds(DS.dungeonMap + 0x400, 0x100)
    const out: { slot: number; tile: number; x: number; y: number; talk: number }[] = []
    for (let i = 0; i < 32; i++) if (n[0x60 + i]) out.push({ slot: i, tile: n[0x60 + i]!, x: n[0x20 + i]!, y: n[0x40 + i]!, talk: n[0xe0 + i]! })
    return out
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
    opts: { throughRooms?: boolean; dispel?: boolean; stopOnBattle?: boolean; maxSteps?: number; onBattle?: (r: BattleResult) => void } = {}
  ): Promise<PartySave> {
    const level0 = this.state().dungeonLevel
    let onward: Dir | undefined // where the route goes after the cell we just stepped into
    const roomVisits = new Map<string, number>()
    for (let step = 0; step < (opts.maxSteps ?? 200); step++) {
      if (this.inBattle()) {
        if (opts.stopOnBattle) return this.state()
        // a room is left by walking off its edge: leave on the side the route continues from the room the party is in
        const exitFor = (): Dir | undefined => {
          const here = this.state()
          const p = dungeonPath([this.dungeonLevel()], { z: 0, x: here.x, y: here.y }, { z: 0, x: tx, y: ty }, opts.dispel, this.roomSides())
          return p && p.length > 1 ? (['left', 'up', 'right', 'down'] as const)[stepDir(p[0]!, p[1]!)] : undefined
        }
        const r = await this.fightBattle({ exitToward: onward, exitFor })
        opts.onBattle?.(r)
        if (r.outcome !== 'won') throw new DriverError(`Battle ${r.outcome} on the way to ${tx},${ty}`)
        continue
      }
      const s = this.state()
      if (s.dungeonLevel !== level0) throw new DriverError(`Changed level while walking (now L${s.dungeonLevel + 1})`)
      if (s.x === tx && s.y === ty) return s
      // rooms only by the sides they open on; energy fields only when we can Dispel
      const level = this.dungeonLevel()
      const sides = this.roomSides()
      const path = dungeonPath([level], { z: 0, x: s.x, y: s.y }, { z: 0, x: tx, y: ty }, false, sides) ??
        (opts.dispel ? dungeonPath([level], { z: 0, x: s.x, y: s.y }, { z: 0, x: tx, y: ty }, true, sides) : null)
      if (!path || path.length < 2) throw new DriverError(`No dungeon route from ${s.x},${s.y} to ${tx},${ty} on L${s.dungeonLevel + 1}`)
      const route = path.slice(1).map((p, i) => stepDir(path[i]!, p))
      onward = route.length > 1 ? (['left', 'up', 'right', 'down'] as const)[route[1]!] : undefined
      const next = path[1]!
      if ((level[next.y * DNG_SIZE + next.x]! & 0xf0) === 0xd0) {
        const k = `${next.x},${next.y}`
        roomVisits.set(k, (roomVisits.get(k) ?? 0) + 1)
        if (roomVisits.get(k)! > 3) throw new DriverError(`Stuck going through the room at ${k} on L${s.dungeonLevel + 1}`)
      }
      const keys = stepKeys(s.orientation, route[0]!)
      const [dx, dy] = DNG_DELTA[route[0]!]!
      if (level[((s.y + dy + 8) % 8) * DNG_SIZE + ((s.x + dx + 8) % 8)] === ENERGY_FIELD) {
        for (const k of keys.slice(0, -1)) await this.press(k) // face the field
        await this.dispelAhead()
        continue
      }
      for (const k of keys) {
        await this.press(k)
        if (this.inBattle()) break
      }
    }
    throw new DriverError(`Gave up walking to ${tx},${ty}`)
  }

  /**
   * Cast Dispel on the field in front of the party (in a dungeon it takes no
   * direction: C, member, D; U4_SPELL.C SPL_Dispel). The spell can fail, so retry.
   */
  async dispelAhead(tries = 4): Promise<void> {
    const DISPEL = 3
    for (let i = 0; i < tries; i++) {
      const s = this.state()
      if ((s.mixtures[DISPEL] ?? 0) === 0) throw new DriverError('Cannot Dispel: no Dispel mixture left')
      // magic comes back a point a turn (U4_UTIL.C MP_recover): rest until someone can cast
      for (let rest = 0; rest < 120 && !this.state().members.some((m) => m.status === 'G' && m.mp >= 20); rest++) {
        await this.press('space', 600)
        if (this.inBattle()) {
          const r = await this.fightBattle()
          if (r.outcome !== 'won') throw new DriverError(`Battle ${r.outcome} while resting to Dispel`)
        }
      }
      const caster = this.state().members.findIndex((m) => m.status === 'G' && m.mp >= 20)
      if (caster < 0) throw new DriverError('Cannot Dispel: nobody has 20 MP even after resting')
      const [dx, dy] = DNG_DELTA[s.orientation]!
      const at = ((s.y + dy + 8) % 8) * DNG_SIZE + ((s.x + dx + 8) % 8)
      this.key('c')
      await sleep(150)
      this.key(String(caster + 1))
      await sleep(150)
      this.key('d')
      await sleep(700)
      if (this.dungeonLevel()[at] !== ENERGY_FIELD) return
    }
    throw new DriverError('Dispel kept failing')
  }

  /**
   * Travel to (z, x, y) in the current dungeon across levels: plan over the
   * dungeon file (the current level from live memory), walk each level, take
   * ladders. With `dispel`, energy fields on the way are dispelled.
   */
  async dungeonTravel(
    tz: number,
    tx: number,
    ty: number,
    opts: { dispel?: boolean; onBattle?: (r: BattleResult) => void; onLevel?: (s: PartySave) => void } = {}
  ): Promise<PartySave> {
    const { levels } = this.dungeonFile()
    const sides = this.roomSides()
    for (let hops = 0; hops < 20; hops++) {
      const s = this.state()
      if (s.dungeonLevel === tz && s.x === tx && s.y === ty) return s
      const known = levels.map((l, z) => (z === s.dungeonLevel ? this.dungeonLevel() : l))
      const plan = dungeonPlan(known, { z: s.dungeonLevel, x: s.x, y: s.y }, { z: tz, x: tx, y: ty }, opts.dispel, sides)
      if (!plan) throw new DriverError(`No way from L${s.dungeonLevel + 1} ${s.x},${s.y} to L${tz + 1} ${tx},${ty}`)
      const leg = plan[0]!
      await this.dungeonWalkTo(leg.x, leg.y, { dispel: opts.dispel, onBattle: opts.onBattle })
      if (leg.then) opts.onLevel?.(await this.ladder(leg.then))
    }
    throw new DriverError('Gave up travelling')
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
