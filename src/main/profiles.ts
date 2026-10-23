// Playthrough profiles on disk: <userData>/profiles.json lists them and names the
// active one; each profile's journal and explored-map files live in
// <userData>/profiles/<id>/. The first run moves the old single-playthrough files
// into the default profile (keeping a .pre-profiles copy), so nothing is lost.
import { copyFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DEFAULT_PROFILE, MAX_PROFILES, PROFILE_FILES, normalizeIndex, profileId } from '@shared/profiles'
import type { Profile, ProfileIndex } from '@shared/profiles'

const exists = (p: string) => stat(p).then(() => true, () => false)

export class ProfileStore {
  private index: ProfileIndex = { active: DEFAULT_PROFILE.id, profiles: [{ ...DEFAULT_PROFILE }] }

  constructor(private readonly base: string) {}

  private get file(): string {
    return join(this.base, 'profiles.json')
  }

  /** Folder holding a profile's files. */
  dir(id = this.index.active): string {
    return join(this.base, 'profiles', id)
  }

  /** Load the index, migrating the old single-playthrough files on the first run. */
  async init(): Promise<ProfileIndex> {
    if (await exists(this.file)) {
      let raw: unknown = {}
      try {
        raw = JSON.parse(await readFile(this.file, 'utf8'))
      } catch {
        // damaged index: keep the profile folders and fall back to a valid list
      }
      this.index = normalizeIndex(raw)
    } else {
      this.index = { active: DEFAULT_PROFILE.id, profiles: [{ ...DEFAULT_PROFILE, createdAt: Date.now() }] }
      await mkdir(this.dir(), { recursive: true })
      for (const f of PROFILE_FILES) {
        const old = join(this.base, f)
        if (!(await exists(old))) continue
        await copyFile(old, join(this.dir(), f))
        await rename(old, `${old}.pre-profiles`) // kept, not deleted
      }
      await this.save()
    }
    await mkdir(this.dir(), { recursive: true })
    return this.list()
  }

  list(): ProfileIndex {
    return { active: this.index.active, profiles: this.index.profiles.map((p) => ({ ...p })) }
  }

  active(): Profile {
    return this.index.profiles.find((p) => p.id === this.index.active)!
  }

  private async save(): Promise<void> {
    await mkdir(this.base, { recursive: true })
    const tmp = `${this.file}.tmp`
    await writeFile(tmp, JSON.stringify(this.index, null, 2))
    await rename(tmp, this.file)
  }

  /** A new, empty playthrough (it does not become active by itself). */
  async create(name: string): Promise<Profile> {
    if (this.index.profiles.length >= MAX_PROFILES) throw new Error('Too many playthroughs')
    const clean = name.trim().slice(0, 60) || 'New playthrough'
    const profile: Profile = { id: profileId(clean, this.index.profiles.map((p) => p.id)), name: clean, createdAt: Date.now() }
    this.index.profiles.push(profile)
    await mkdir(this.dir(profile.id), { recursive: true })
    await this.save()
    return profile
  }

  async switchTo(id: string): Promise<Profile> {
    if (!this.index.profiles.some((p) => p.id === id)) throw new Error('No such playthrough')
    this.index.active = id
    await mkdir(this.dir(), { recursive: true })
    await this.save()
    return this.active()
  }

  async rename(id: string, name: string): Promise<void> {
    const p = this.index.profiles.find((q) => q.id === id)
    if (!p || !name.trim()) return
    p.name = name.trim().slice(0, 60)
    await this.save()
  }

  /** Remember the Avatar this playthrough belongs to, the first time one is seen. */
  async noteAvatar(name: string): Promise<boolean> {
    const p = this.active()
    if (p.avatar || !name) return false
    p.avatar = name.slice(0, 16)
    await this.save()
    return true
  }
}
