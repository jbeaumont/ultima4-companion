// How far live play has run ahead of the save file. The game only writes
// PARTY.SAV on Quit & Save (outdoors), so this is progress that would be lost.
import type { PartySave } from '@parsers/party'

/** Moves since the last save, or null if the live game isn't the saved one. */
export function unsavedMoves(live: PartySave | null, saved: PartySave | null): number | null {
  if (!live || !saved) return null
  const name = (p: PartySave) => p.allRecords[0]?.name ?? ''
  if (name(live) !== name(saved) || live.moves < saved.moves) return null
  return live.moves - saved.moves
}

/** Saving is only possible on the surface (the game answers "Not Here!" elsewhere). */
export const canSaveHere = (p: PartySave): boolean => p.location === 0
