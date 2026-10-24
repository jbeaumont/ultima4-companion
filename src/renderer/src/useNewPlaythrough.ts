import { useEffect, useState } from 'react'
import type { PartySave } from '@parsers/party'
import { adoption } from '@shared/profiles'
import type { ProfileIndex } from '@shared/profiles'

/**
 * Whether the active playthrough is waiting for a new game: the save still holds a
 * character it has not adopted (#67). Views show what to do instead of that
 * character's details.
 */
export function useNewPlaythrough(p: PartySave | null): { waiting: boolean; index: ProfileIndex | null; follow: () => void } {
  const [index, setIndex] = useState<ProfileIndex | null>(null)
  const name = p?.allRecords[0]?.name
  useEffect(() => {
    void window.u4.listProfiles().then(setIndex, () => undefined)
  }, [name])
  const active = index?.profiles.find((q) => q.id === index.active)
  return {
    waiting: !!p && !!index && adoption(active, index.profiles, name, p.moves) === 'wait',
    index,
    follow: () => void window.u4.followAvatar().then(setIndex, () => undefined)
  }
}
