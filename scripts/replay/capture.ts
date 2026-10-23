// Turn what the test companion shows right now into a replay fixture skeleton.
//   npx tsx scripts/replay/capture.ts <name> [verified-where]
// Run it at a checkpoint of a live journey, then fill in `expect` with outcomes you
// checked against the game (not just today's output) and review the file: it must
// hold only normalized fields, no paths, keys or player names.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Companion } from '../hillclimb/companion'

const [name, where = ''] = process.argv.slice(2)
if (!name) throw new Error('usage: capture.ts <name> [verified-where]')

const c = await Companion.connect()
const { state, journal } = await c.eval<{ state: { party: Record<string, unknown> | null }; journal: Record<string, unknown> }>(
  '(async () => ({ state: await window.u4.getState(), journal: await window.u4.getJournal() }))()'
)
c.close()
const p = state.party
if (!p) throw new Error('the companion has no party to capture')
const pick = <T extends Record<string, unknown>>(o: T, keys: string[]) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]))
const members = (p['members'] as Record<string, unknown>[]).map((m) => ({
  ...pick(m, ['hp', 'hpMax', 'xp', 'mp', 'classIndex', 'status', 'weapon']),
  name: 'Avatar' // never keep a player's character names
}))
const fixture = {
  name,
  verifiedLive: where, // required: where this checkpoint was checked against the game
  state: {
    ...pick(p, ['location', 'x', 'y', 'dungeonLevel', 'moves', 'runes', 'stones', 'items', 'karma', 'food', 'gold', 'reagents', 'mixtures', 'trammel', 'felucca', 'lastMeditation', 'lastCamp', 'lastVirtueTalk', 'lastReagent']),
    members
  },
  knowledge: pick(journal, ['spoilerLevel', 'revealed', 'visited']),
  expect: {}
}
const out = join('tests', 'replay', 'fixtures', `${name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.json`)
writeFileSync(out, JSON.stringify(fixture, null, 2) + '\n')
console.log(`wrote ${out}: fill in "expect" and "verifiedLive", then review it`)
