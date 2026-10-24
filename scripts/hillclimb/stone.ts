// Hill-climb journey: follow a stone hint literally (default the Yellow Stone in
// Despise; pass another dungeon: Deceit, Destard, Wrong, Covetous, Shame). Enter,
// take ladders down to level 5, search the altar (u4-decompiled U4_SRCH2.C:
// searching on a dungeon's altar gives its stone, +5 Honor and 200 XP), and
// check the companion's checklist, stone gem and hint follow.
//   npx tsx scripts/hillclimb/stone.ts <outDir> [dungeon]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePartySav } from '../../src/parsers/party'
import type { PartySave } from '../../src/parsers/party'
import { encodePartySav } from '../../src/parsers/partyWriter'
import { ENTRANCES } from '../../src/domain/places'
import { launchGame } from '../../src/main/launcher'
import { dosboxProcesses, isTestDosbox } from '../../src/main/memory/win32'
import { GameDriver, MODE } from '../driver/driver'
import { findCells } from '../../src/domain/dungeonRoute'
import { HINTS } from '../../src/domain/hints'
import { parseDng } from '../../src/parsers/dungeon'
import { Companion } from './companion'

const GAME = process.env['U4_DIR'] ?? 'C:\\Program Files\\GOG Galaxy\\Games\\Ultima 4'
const TEST_DATA = join(process.env['APPDATA']!, 'ultima4-companion-test')
const OVERLAY = join(TEST_DATA, 'game-saves')
// the six altar dungeons: location id = 17 + stone index (U4_SRCH2.C: stone = location - 0x11)
const DUNGEONS = ['Deceit', 'Despise', 'Destard', 'Wrong', 'Covetous', 'Shame'] as const
const COLORS = ['Blue', 'Yellow', 'Red', 'Green', 'Orange', 'Purple'] as const
const VIRTUE_OF = ['Honesty', 'Compassion', 'Valor', 'Justice', 'Sacrifice', 'Honor'] as const
const NAME = (process.argv[3] ?? 'Despise').replace(/^./, (c) => c.toUpperCase())
const STONE = DUNGEONS.indexOf(NAME as (typeof DUNGEONS)[number])
if (STONE < 0) throw new Error(`unknown dungeon ${NAME}`)
const DUNGEON_ID = 17 + STONE
const COLOR = COLORS[STONE]!
const VIRTUE_INDEX = STONE // the first six virtues, in order
const findings: string[] = []
const expect = (ok: boolean, what: string) => {
  log(`${ok ? 'ok  ' : 'GAP '} ${what}`)
  if (!ok) findings.push(what)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const t0 = Date.now()
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)
const hp = (s: PartySave) => s.members.map((m) => `${m.name} ${m.hp}/${m.hpMax} ${m.status}`).join(', ')
const where = (s: PartySave) =>
  s.location === 0 ? `surface ${s.x},${s.y}` : `loc ${s.location} L${s.dungeonLevel + 1} ${s.x},${s.y} facing ${'WNES'[s.orientation] ?? s.orientation}`

async function main(): Promise<void> {
  const OUT = process.argv[2] ?? join(process.cwd(), 'hillclimb-out')
  mkdirSync(OUT, { recursive: true })
  if ((await dosboxProcesses()).some((p) => isTestDosbox(p.commandLine))) throw new Error('A test game is already running; close it first')
  mkdirSync(OVERLAY, { recursive: true })
  for (const f of ['PARTY.SAV', 'MONSTERS.SAV', 'OUTMONST.SAV', 'DNGMAP.SAV']) {
    const src = join(GAME, 'cloud_saves', f)
    if (existsSync(src)) copyFileSync(src, join(OVERLAY, f))
  }
  const tpl = parsePartySav(new Uint8Array(readFileSync(join(GAME, 'PARTY.SAV'))))
  const raw = new Uint8Array(readFileSync(join(OVERLAY, 'PARTY.SAV')))
  const s0 = parsePartySav(raw)
  s0.allRecords[1] = { ...tpl.allRecords[1]! }
  s0.memberCount = 2
  for (const r of s0.allRecords.slice(0, 2)) {
    // a test party built to survive: the journey checks the route and the hint, not the fighting
    r.hpMax = 800 // the game's cap
    r.hp = 800
    r.status = 'G'
    r.mp = 99
    r.str = r.dex = r.int = 50 // the game's cap
    r.weapon = 14 // Magic Wand: the strongest weapon that fires along a line
    r.armor = 7 // Mystic Armour
  }
  s0.mixtures[2] = 30 // Cure
  s0.mixtures[7] = 60 // Heal
  s0.mixtures[12] = 30 // Magic Missile
  s0.mixtures[3] = 20 // Dispel, for energy fields (in the dungeon and in rooms)
  s0.stones &= ~(1 << STONE)
  s0.x = ENTRANCES[DUNGEON_ID]!.x
  s0.y = ENTRANCES[DUNGEON_ID]!.y
  s0.torches = Math.max(s0.torches, 20)
  s0.food = Math.max(s0.food, 50000)
  writeFileSync(join(OVERLAY, 'PARTY.SAV'), encodePartySav(s0, raw))
  const names = s0.allRecords.slice(0, 2).map((r) => r.name)
  log(`test save: ${names.join(' + ')} (maxed stats, Magic Wand, Mystic Armour, spells), no ${COLOR} Stone, on ${NAME}'s entrance`)

  const c = await Companion.connect()
  await c.freshJournal() // checks must not pass on an earlier run's journal
  const capture = async (tag: string, views: string[]) => {
    const texts: Record<string, string> = {}
    for (const v of views) {
      texts[v] = await c.view(v, v === 'Map' ? 1500 : 700)
      writeFileSync(join(OUT, `${tag}-${v}.txt`), texts[v]!)
      await c.shot(join(OUT, `${tag}-${v}.png`))
    }
    log(`captured ${tag}`)
    return texts
  }
  await launchGame({ profile: 'test', gameDir: GAME, overlayDir: OVERLAY, confDir: TEST_DATA })
  const d = await GameDriver.attach(GAME, names)
  await d.journeyOnward()
  await c.until('window.u4.getState().then((s) => s && s.source === "memory")', 15000)
  let s = await d.enter()
  if (s.location !== DUNGEON_ID || d.mode() !== MODE.dungeon) throw new Error(`did not enter ${NAME}`)
  log(`entered: ${where(s)}`)

  // the altar's part of level 5 is sealed by energy fields: travel there across levels, dispelling on the way
  const onBattle = (r: { outcome: string; turns: number; log: string[] }) => {
    log(`  battle ${r.outcome} in ${r.turns} turns`)
    writeFileSync(join(OUT, `battle-${Date.now()}.log`), r.log.join('\n'))
  }
  // the level our hint names, and the altar the dungeon file puts there
  const hint = HINTS.find((h) => h.id === `stone-${COLOR.toLowerCase()}`)!
  const ALTAR_LEVEL = Number(/level (\d) of/.exec(hint.tiers[2])![1]) - 1
  log(`hint: ${hint.tiers[2]}`)
  const altar = findCells(parseDng(new Uint8Array(readFileSync(join(GAME, `${NAME.toUpperCase()}.DNG`)))).levels[ALTAR_LEVEL]!, (c) => (c & 0xf0) === 0xb0)[0]
  if (!altar) throw new Error(`no altar on level ${ALTAR_LEVEL + 1} of ${NAME}: the hint is wrong`)
  s = await d.dungeonTravel(ALTAR_LEVEL, altar.x, altar.y, { dispel: true, onBattle, onLevel: (p) => log(`ladder: ${where(p)}; ${hp(p)}`) })
  log(`on the altar at ${s.x},${s.y}`)
  const before = d.state()
  await d.press('s')
  s = await d.waitFor((p) => (p.stones & (1 << STONE)) !== 0, 5000, `the ${COLOR} Stone`)
  log(`found the ${COLOR} Stone; Honor ${before.karma[5]} -> ${s.karma[5]}`)
  await new Promise((r) => setTimeout(r, 1000))

  const b = await capture('after', ['Dashboard', 'Journal', 'Hints'])
  expect(b['Journal']!.includes(`✓ ${COLOR} Stone`), `Journal checklist ticks the ${COLOR} Stone`)
  expect(new RegExp(`${COLOR} Stone \\(${VIRTUE_OF[STONE]}\\)\\s*Solved`).test(b['Hints']!), `Hints mark the ${COLOR} Stone topic solved`)
  const gems = await c.eval<boolean[]>(`(async () => { [...document.querySelectorAll('.sidebar button')].find((b) => b.textContent === 'Dashboard').click(); await new Promise((r) => setTimeout(r, 500)); return [...document.querySelectorAll('.d-virtues .d-gem')].map((g) => g.classList.contains('on')) })()`)
  expect(gems[VIRTUE_INDEX] === true, `the ${VIRTUE_OF[STONE]} card lights its ${COLOR.toLowerCase()} stone`)

  writeFileSync(join(OUT, 'findings.txt'), findings.join('\n'))
  log(`${findings.length} gap(s); captures in ${OUT}`)
  process.kill(d.pid)
  d.close()
  c.close()
}

main().catch((err) => {
  log(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 2
})
