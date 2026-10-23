// Live game state read from DOSBox's emulated RAM (read-only). Attaches to
// dosbox.exe, finds the party block once, then polls it. Detaches and rescans if
// the block stops looking valid (DOSBox restarted, game quit to the title, ...).
import { BATTLE_DS, isBattleMode, parseBattle } from '@parsers/battle'
import { PARTY_SAV_SIZE, parsePartySav } from '@parsers/party'
import { parseTlk } from '@parsers/talk'
import { flat } from '@domain/talkSim'
import type { GameState } from '@shared/types'
import { findPartyBlocks, pickLive } from './scan'
import { ObservationTracker, takeSample } from './observation'
import { ProcessReader, dosboxProcesses, memorySupported } from './win32'

const POLL_MS = 250
/** While nothing changes, still report a successful read this often, so unchanged never looks stale. */
const HEARTBEAT_MS = 2000
const RESCAN_MS = 3000
const CHUNK = 4 << 20
const OVERLAP = PARTY_SAV_SIZE

export interface Attachment {
  pid: number
  address: bigint
}

export class MemorySource {
  private reader: ProcessReader | null = null
  private address = 0n
  private timer: NodeJS.Timeout | null = null
  private last: Uint8Array | null = null
  /** The conversation record last seen, and how many new conversations since attaching. */
  private talk: Uint8Array | null = null
  private lastTalk: { name: string; serial: number } | null = null
  /** Each monster slot's tile and HP when first seen in the current battle. */
  private battleStart = new Map<number, { tile: number; hp: number }>()
  private readonly tracker = new ObservationTracker()
  private lastEmit = 0
  private lastBytes: { party: Uint8Array; battle: Uint8Array | null } | null = null
  private stopped = true
  private onState: (s: GameState | null) => void = () => {}

  /**
   * @param names party names from the latest save, to search for quickly; may be empty
   * @param base fields copied into every emitted state (gameDir, savePath)
   * @param accept which DOSBox processes (by command line) this instance may attach to,
   *   so a normal companion never reads a test game and vice versa
   */
  constructor(
    private readonly names: () => string[],
    private readonly base: () => Pick<GameState, 'gameDir' | 'savePath'>,
    private readonly accept: (commandLine: string) => boolean = () => true
  ) {}

  /** Emits live states while attached, and null whenever it is not attached. */
  start(onState: (s: GameState | null) => void): void {
    if (!memorySupported) return
    this.onState = onState
    this.stopped = false
    void this.tick()
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.detach()
  }

  attachment(): Attachment | null {
    return this.reader ? { pid: this.reader.pid, address: this.address } : null
  }

  private schedule(ms: number): void {
    if (this.stopped) return
    this.timer = setTimeout(() => void this.tick(), ms)
  }

  private detach(): void {
    const was = !!this.reader
    this.reader?.close()
    this.reader = null
    this.last = null
    this.lastBytes = null
    // nothing transient survives into the next attachment
    this.talk = null
    this.lastTalk = null
    this.battleStart.clear()
    this.tracker.detach()
    if (was && !this.stopped) this.onState(null)
  }

  private async tick(): Promise<void> {
    if (this.stopped) return
    if (!this.reader) {
      await this.attach()
      const attached = this.reader as ProcessReader | null // set by attach()
      if (attached) this.tracker.attach(attached.pid, Date.now())
      return this.schedule(attached ? POLL_MS : RESCAN_MS)
    }
    const reader = this.reader
    const result = takeSample((a, n) => reader.read(a, n), this.address)
    if (result.kind === 'gone') {
      this.detach()
      return this.schedule(RESCAN_MS)
    }
    if (result.kind === 'inconsistent') {
      // keep showing the last consistent state, but say the live view is unsure
      const before = this.tracker.current()?.status
      const obs = this.tracker.inconsistent()
      if (obs.status !== before && this.lastBytes) this.emit(this.lastBytes.party, this.lastBytes.battle)
      return this.schedule(POLL_MS)
    }
    const { party: bytes, battle, talk } = result.sample
    const wasRetrying = this.tracker.current()?.status === 'retrying'
    this.tracker.ok(Date.now())
    this.noticeTalk(talk)
    const snapshot = concat(bytes, battle ?? new Uint8Array(0), Uint8Array.of(this.lastTalk?.serial ?? 0))
    const changed = !this.last || !sameBytes(snapshot, this.last)
    if (changed || wasRetrying || Date.now() - this.lastEmit >= HEARTBEAT_MS) {
      this.last = snapshot
      this.lastBytes = { party: bytes, battle }
      this.emit(bytes, battle)
    }
    this.schedule(POLL_MS)
  }

  /**
   * Notice a new conversation: the game loads the NPC's record into D_95CE when
   * talking starts. The first value after attaching is only a baseline (it may be
   * left over from earlier, even another town).
   */
  private noticeTalk(t: Uint8Array | null): void {
    if (!t) return
    if (this.talk && !sameBytes(t, this.talk) && t.some((b) => b !== 0)) {
      const raw = parseTlk(t)[0]?.name
      const name = raw ? flat(raw) : ''
      if (name) this.lastTalk = { name, serial: (this.lastTalk?.serial ?? 0) + 1 }
    }
    this.talk = t
  }

  private emit(bytes: Uint8Array, battle: Uint8Array | null): void {
    let parsed = null
    if (battle) {
      const c = BATTLE_DS.combatSize
      const f = BATTLE_DS.fightersSize
      parsed = parseBattle(battle[0]! | (battle[1]! << 8), battle.subarray(2, 2 + c), battle.subarray(2 + c, 2 + c + f), battle[2 + c + f]!)
      for (const m of parsed.monsters) {
        const seen = this.battleStart.get(m.slot)
        if (!seen || seen.tile !== m.tile) this.battleStart.set(m.slot, { tile: m.tile, hp: m.hp })
        m.startHp = Math.max(this.battleStart.get(m.slot)!.hp, m.hp)
      }
    } else {
      this.battleStart.clear()
    }
    this.onState({ status: 'ok', source: 'memory', ...this.base(), updatedAt: Date.now(), party: parsePartySav(bytes), battle: parsed, lastTalk: this.lastTalk, observation: this.tracker.current() ?? undefined })
    this.lastEmit = Date.now()
  }

  private async attach(): Promise<void> {
    for (const { pid, commandLine } of await dosboxProcesses()) {
      if (!this.accept(commandLine)) continue
      const reader = ProcessReader.open(pid)
      if (!reader) continue
      const found = scanProcess(reader, this.names())
      if (found) {
        this.reader = reader
        this.address = found.address
        this.last = null
        return
      }
      reader.close()
    }
  }
}

/** Scan a process's private RAM for party blocks; returns the live one. */
export function scanProcess(reader: ProcessReader, names: string[]): { address: bigint } | null {
  const blocks: { address: bigint; bytes: Uint8Array }[] = []
  for (const region of reader.regions(0x100000)) {
    for (let off = 0; off < region.size; off += CHUNK) {
      const len = Math.min(CHUNK + OVERLAP, region.size - off)
      const buf = reader.read(region.base + BigInt(off), len)
      if (!buf) continue
      for (const hit of findPartyBlocks(buf, names.length ? names : undefined)) {
        if (hit >= CHUNK) continue // belongs to the next chunk (overlap)
        blocks.push({ address: region.base + BigInt(off + hit), bytes: buf.slice(hit, hit + PARTY_SAV_SIZE) })
      }
    }
  }
  return pickLive(blocks)
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
