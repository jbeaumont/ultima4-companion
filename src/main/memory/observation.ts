// Reading the game from memory is a series of separate reads, so a sample can
// straddle a change. This module takes consistent samples (re-reading the party
// block around the others) and tracks how fresh and trustworthy the live view is,
// separately from whether the game state changed. Pure: memory comes from a read
// function, so it is tested with fake memory.
import { BATTLE_DS, isBattleMode } from '@parsers/battle'
import { PARTY_SAV_SIZE } from '@parsers/party'
import type { Observation } from '@shared/types'
import { looksLikeParty } from './scan'

export type Read = (address: bigint, size: number) => Uint8Array | null

export const TALK_DS = 0x95ce // D_95CE: the TLK record of the person last talked to (U4_TALK.C C_A4B4)
export const TALK_SIZE = 0x120
/** Memory layout this reader understands: the DOS AVATAR.EXE data segment, party block at DS:9144 (u4-decompiled). */
export const LAYOUT = 'u4-dos-ds9144'
/** Extra attempts within one poll when a sample straddles a change. */
export const SAMPLE_RETRIES = 2

export interface Sample {
  party: Uint8Array
  /** Mode, Combat, Fighters and active member, when a battle is on. */
  battle: Uint8Array | null
  talk: Uint8Array | null
}

export type SampleResult = { kind: 'ok'; sample: Sample } | { kind: 'inconsistent' } | { kind: 'gone' }

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i])

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/**
 * Read the party, battle and conversation globals as one sample: the party block
 * (and the game mode, during a battle) must read the same before and after the
 * other reads, or the sample is retried and, failing that, reported inconsistent.
 * This narrows tearing but cannot make separate reads atomic.
 */
export function takeSample(read: Read, partyAddress: bigint): SampleResult {
  const at = (off: number) => partyAddress - BigInt(BATTLE_DS.party) + BigInt(off)
  for (let attempt = 0; attempt <= SAMPLE_RETRIES; attempt++) {
    const party = read(partyAddress, PARTY_SAV_SIZE)
    if (!party || !looksLikeParty(party)) return { kind: 'gone' }
    const mode = read(at(BATTLE_DS.curMode), 2)
    let battle: Uint8Array | null = null
    if (mode && isBattleMode(mode[0]! | (mode[1]! << 8))) {
      const combat = read(at(BATTLE_DS.combat), BATTLE_DS.combatSize)
      const fighters = read(at(BATTLE_DS.fighters), BATTLE_DS.fightersSize)
      const active = read(at(BATTLE_DS.activeChara), 2)
      if (combat && fighters && active) battle = concat(mode, combat, fighters, active)
    }
    const talk = read(at(TALK_DS), TALK_SIZE)
    const partyAfter = read(partyAddress, PARTY_SAV_SIZE)
    const modeAfter = read(at(BATTLE_DS.curMode), 2)
    if (partyAfter && same(party, partyAfter) && (!mode || (modeAfter && same(mode, modeAfter)))) {
      return { kind: 'ok', sample: { party, battle, talk } }
    }
  }
  return { kind: 'inconsistent' }
}

/** Consecutive inconsistent samples after which the live view is reported as unreliable. */
export const RETRYING_AFTER = 2

/** Freshness and provenance of the live view for one attachment ("session"). */
export class ObservationTracker {
  private obs: Observation | null = null
  private failures = 0

  /** A new attachment: a new session, nothing carried over. */
  attach(pid: number, now: number): Observation {
    this.failures = 0
    this.obs = { session: `${pid}-${now}`, sequence: 0, observedAt: now, status: 'live', layout: LAYOUT }
    return this.current()!
  }

  /** A successful, consistent read, whether or not the game state changed. */
  ok(now: number): Observation {
    this.failures = 0
    this.obs = { ...this.obs!, sequence: this.obs!.sequence + 1, observedAt: now, status: 'live' }
    return this.current()!
  }

  /** An inconsistent sample: the last good state stands; repeated ones mark the view unreliable. */
  inconsistent(): Observation {
    this.failures++
    if (this.failures >= RETRYING_AFTER) this.obs = { ...this.obs!, status: 'retrying' }
    return this.current()!
  }

  detach(): void {
    this.obs = null
    this.failures = 0
  }

  current(): Observation | null {
    return this.obs ? { ...this.obs, ...(this.failures ? { failures: this.failures } : {}) } : null
  }
}
