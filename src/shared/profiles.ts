// Playthrough profiles: each owns its journal and explored-map history, so a new
// character or another install never mixes with an earlier playthrough. Pure
// model and validation; storage lives in src/main/profiles.ts.

export interface Profile {
  id: string
  name: string
  createdAt: number
  /** Avatar name first seen while this profile was active (to flag a different character). */
  avatar?: string
  /**
   * The character in the game's save slot when this playthrough was created. It is
   * not adopted: the playthrough waits for a new game (another name, or moves back
   * below this count) or for the player to choose to follow it (#67).
   */
  waitingFor?: { avatar: string; moves: number }
}

export interface ProfileIndex {
  active: string
  profiles: Profile[]
}

export const DEFAULT_PROFILE: Profile = { id: 'main', name: 'Main playthrough', createdAt: 0 }
export const MAX_PROFILES = 50

/** Files that belong to a profile (moved out of userData by the one-time migration). */
export const PROFILE_FILES = ['journal.json', 'explored.bin', 'explored-dungeons.bin'] as const

const ID = /^[a-z0-9-]{1,40}$/

const waitingFor = (w: unknown): boolean => {
  const o = w as Record<string, unknown> | null
  return !!o && typeof o === 'object' && typeof o.avatar === 'string' && typeof o.moves === 'number'
}

/** A valid index from whatever was on disk; always has the active profile in it. */
export function normalizeIndex(raw: unknown): ProfileIndex {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const seen = new Set<string>()
  const profiles: Profile[] = []
  for (const p of Array.isArray(r.profiles) ? r.profiles.slice(0, MAX_PROFILES) : []) {
    if (!p || typeof p !== 'object') continue
    const q = p as Record<string, unknown>
    if (typeof q.id !== 'string' || !ID.test(q.id) || seen.has(q.id)) continue
    const name = typeof q.name === 'string' && q.name.trim() ? q.name.trim().slice(0, 60) : q.id
    seen.add(q.id)
    profiles.push({
      id: q.id,
      name,
      createdAt: typeof q.createdAt === 'number' ? q.createdAt : 0,
      ...(typeof q.avatar === 'string' && q.avatar ? { avatar: q.avatar.slice(0, 16) } : {}),
      ...(waitingFor(q.waitingFor) ? { waitingFor: q.waitingFor as Profile['waitingFor'] } : {})
    })
  }
  if (!profiles.length) profiles.push({ ...DEFAULT_PROFILE })
  const active = typeof r.active === 'string' && seen.has(r.active) ? r.active : profiles[0]!.id
  return { active, profiles }
}

/** A short unique id from a name: "Sam's second run" -> "sam-s-second-run" (with a suffix if taken). */
export function profileId(name: string, taken: readonly string[]): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'playthrough'
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`
  return id
}

/** The active profile's recorded Avatar differs from the one in the game now. */
export const differentAvatar = (profile: Profile | undefined, avatar: string | undefined): boolean =>
  !!profile?.avatar && !!avatar && profile.avatar !== avatar

/**
 * What a playthrough does with the character now in the game:
 * - 'has': it already follows a character;
 * - 'wait': the character belongs to the save that was there when the playthrough
 *   was created, or (for older playthroughs) to another playthrough; it is not
 *   adopted until a new game starts or the player chooses to follow it;
 * - 'adopt': a character this playthrough should follow from now on.
 */
export function adoption(profile: Profile | undefined, others: readonly Profile[], avatar: string | undefined, moves: number): 'has' | 'wait' | 'adopt' | 'none' {
  if (!profile || !avatar) return 'none'
  if (profile.avatar) return 'has'
  const w = profile.waitingFor
  if (w) return avatar === w.avatar && moves >= w.moves ? 'wait' : 'adopt'
  return others.some((o) => o.id !== profile.id && o.avatar === avatar) ? 'wait' : 'adopt'
}
