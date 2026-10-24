// Hill-climb journey: follow a rune hint literally. Start at the town's gate
// without the rune, walk to the spot the hint names, search, and check the game
// (the rune bit) and the companion (checklist, rune badge, hint solved).
//   npx tsx scripts/hillclimb/rune.ts <outDir> <virtue>
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePartySav } from '../../src/parsers/party'
import { encodePartySav } from '../../src/parsers/partyWriter'
import { ENTRANCES } from '../../src/domain/places'
import { HINTS } from '../../src/domain/hints'
import { VIRTUES } from '../../src/domain/constants'
import { launchGame } from '../../src/main/launcher'
import { dosboxProcesses, isTestDosbox } from '../../src/main/memory/win32'
import { GameDriver } from '../driver/driver'
import { Companion } from './companion'

const GAME = process.env['U4_DIR'] ?? 'C:\\Program Files\\GOG Galaxy\\Games\\Ultima 4'
const TEST_DATA = join(process.env['APPDATA']!, 'ultima4-companion-test')
const OVERLAY = join(TEST_DATA, 'game-saves')
const OUT = process.argv[2] ?? join(process.cwd(), 'hillclimb-out')
const VIRTUE = (process.argv[3] ?? 'Honesty').replace(/^./, (c) => c.toUpperCase())
const INDEX = VIRTUES.indexOf(VIRTUE as (typeof VIRTUES)[number])
// the town holding each rune (U4_SRCH.C D_2904): Spirituality's is in Lord British's castle, Humility's in Paws
const TOWN = [5, 6, 7, 8, 9, 10, 1, 13][INDEX]!
const t0 = Date.now()
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)
const findings: string[] = []
const expect = (ok: boolean, what: string) => {
  log(`${ok ? 'ok  ' : 'GAP '} ${what}`)
  if (!ok) findings.push(what)
}

async function main(): Promise<void> {
  if (INDEX < 0) throw new Error(`unknown virtue ${VIRTUE}`)
  mkdirSync(OUT, { recursive: true })
  if ((await dosboxProcesses()).some((p) => isTestDosbox(p.commandLine))) throw new Error('A test game is already running; close it first')
  mkdirSync(OVERLAY, { recursive: true })
  for (const f of ['PARTY.SAV', 'MONSTERS.SAV', 'OUTMONST.SAV', 'DNGMAP.SAV']) {
    const src = join(GAME, 'cloud_saves', f)
    if (existsSync(src)) copyFileSync(src, join(OVERLAY, f))
  }
  const raw = new Uint8Array(readFileSync(join(OVERLAY, 'PARTY.SAV')))
  const s0 = parsePartySav(raw)
  s0.runes &= ~(1 << INDEX)
  s0.mixtures[3] = Math.max(s0.mixtures[3]!, 4) // Dispel, in case a field seals the spot
  s0.allRecords[0]!.mp = Math.max(s0.allRecords[0]!.mp, 99)
  s0.mixtures[3] = Math.max(s0.mixtures[3]!, 6)
  s0.keys = Math.max(s0.keys, 2) // in case a locked door stands in the way
  s0.x = ENTRANCES[TOWN]!.x
  s0.y = ENTRANCES[TOWN]!.y
  writeFileSync(join(OVERLAY, 'PARTY.SAV'), encodePartySav(s0, raw))
  const names = s0.allRecords.slice(0, Math.max(1, s0.memberCount)).map((r) => r.name)

  const hint = HINTS.find((h) => h.id === `rune-${VIRTUE.toLowerCase()}`)!
  const m = /town map (\d+),(\d+)/.exec(hint.tiers[2])
  if (!m) throw new Error(`the ${VIRTUE} rune hint names no town spot`)
  const [x, y] = [Number(m[1]), Number(m[2])]
  log(`hint: ${hint.tiers[2]}`)

  const c = await Companion.connect()
  await c.freshJournal()
  await launchGame({ profile: 'test', gameDir: GAME, overlayDir: OVERLAY, confDir: TEST_DATA })
  const d = await GameDriver.attach(GAME, names)
  await d.journeyOnward()
  await c.until('window.u4.getState().then((s) => s && s.source === "memory")', 15000)
  let s = await d.enter()
  expect(s.location === TOWN, `entered the rune's town (location ${s.location})`)
  d.trace = !!process.env['TRACE']
  s = await d.walkTo(x, y, 600, { dispel: true, unlock: true })
  log(`at ${s.x},${s.y}; searching`)
  s = await d.search()
  s = await d.waitFor((p) => (p.runes & (1 << INDEX)) !== 0, 3000, `the Rune of ${VIRTUE}`).catch(() => d.state())
  expect((s.runes & (1 << INDEX)) !== 0, `searching at the hinted spot finds the Rune of ${VIRTUE}`)
  await new Promise((r) => setTimeout(r, 1000))
  const journal = await c.view('Journal', 700)
  const hints = await c.view('Hints', 700)
  expect(journal.includes(`✓ Rune of ${VIRTUE}`), 'Journal checklist ticks the rune')
  expect(new RegExp(`Rune of ${VIRTUE}\\s*Solved`).test(hints), 'Hints mark the rune topic solved')
  writeFileSync(join(OUT, `findings-${VIRTUE}.txt`), findings.join('\n'))
  log(`${findings.length} gap(s)`)
  process.kill(d.pid)
  d.close()
  c.close()
}

main().catch((err) => {
  log(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 2
})
