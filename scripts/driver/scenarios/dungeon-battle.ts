// Scenario: a two-member party enters Despise, walks into the room on level 1,
// fights the battle to the end (leaving the room is how room battles end), then
// routes to the ladder and descends to level 2. Fully scripted; covers the
// driver's battle and dungeon movement. Leaves the test game running unless --close.
//   npx tsx scripts/driver/scenarios/dungeon-battle.ts [--close]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePartySav } from '../../../src/parsers/party'
import type { PartySave } from '../../../src/parsers/party'
import { encodePartySav } from '../../../src/parsers/partyWriter'
import { ENTRANCES } from '../../../src/domain/places'
import { findCells } from '../../../src/domain/dungeonRoute'
import { launchGame } from '../../../src/main/launcher'
import { dosboxProcesses, isTestDosbox } from '../../../src/main/memory/win32'
import { GameDriver, MODE } from '../driver'

const GAME = process.env['U4_DIR'] ?? 'C:\\Program Files\\GOG Galaxy\\Games\\Ultima 4'
const TEST_DATA = join(process.env['APPDATA']!, 'ultima4-companion-test')
const OVERLAY = join(TEST_DATA, 'game-saves')
const DESPISE = 18
const t0 = Date.now()
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)
const hp = (s: PartySave) => s.members.map((m) => `${m.name} ${m.hp}/${m.hpMax} ${m.status}`).join(', ')
const where = (s: PartySave) =>
  s.location === 0 ? `surface ${s.x},${s.y}` : `loc ${s.location} L${s.dungeonLevel + 1} ${s.x},${s.y} facing ${'WNES'[s.orientation] ?? s.orientation}`

async function main(): Promise<void> {
  if ((await dosboxProcesses()).some((p) => isTestDosbox(p.commandLine))) throw new Error('A test game is already running; close it first')

  // test save: the real save plus Iolo, healed, on Despise's entrance
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
    r.hp = r.hpMax
    r.status = 'G'
  }
  s0.x = ENTRANCES[DESPISE]!.x
  s0.y = ENTRANCES[DESPISE]!.y
  s0.torches = Math.max(s0.torches, 10)
  writeFileSync(join(OVERLAY, 'PARTY.SAV'), encodePartySav(s0, raw))
  const names = s0.allRecords.slice(0, 2).map((r) => r.name)
  log(`test save: ${names.join(' + ')} on Despise's entrance`)

  await launchGame({ profile: 'test', gameDir: GAME, overlayDir: OVERLAY, confDir: TEST_DATA })
  const d = await GameDriver.attach(GAME, names)
  let s = await d.journeyOnward()
  s = await d.enter()
  log(`entered: ${where(s)} (mode ${d.mode()})`)
  if (s.location !== DESPISE || d.mode() !== MODE.dungeon) throw new Error('did not enter Despise')

  // 1. walk into the nearest room and fight
  const rooms = findCells(d.dungeonLevel(), (c) => (c & 0xf0) === 0xd0)
  if (!rooms.length) throw new Error('no room on this level')
  const room = rooms.sort((a, b) => Math.abs(a.x - s.x) + Math.abs(a.y - s.y) - (Math.abs(b.x - s.x) + Math.abs(b.y - s.y)))[0]!
  log(`room at ${room.x},${room.y}; walking in`)
  await d.dungeonWalkTo(room.x, room.y, { throughRooms: true, stopOnBattle: true })
  if (!d.inBattle()) throw new Error(`no battle started (mode ${d.mode()})`)
  const b0 = d.battle()
  log(`battle (mode ${b0.mode}): ${b0.monsters.length} monsters, party at ${b0.view.party.filter(Boolean).map((p) => `${p!.x},${p!.y}`).join(' ')}`)
  const r = await d.fightBattle({ exitToward: 'right' }) // onward, toward the ladder
  for (const line of r.log) log(`  ${line}`)
  s = d.state()
  log(`battle ${r.outcome} in ${r.turns} turns; now ${where(s)}; ${hp(s)}`)
  if (r.outcome !== 'won') throw new Error(`battle ${r.outcome}`)

  // 2. route to a ladder down and descend
  const ladders = findCells(d.dungeonLevel(), (c) => (c & 0xf0) === 0x20 || (c & 0xf0) === 0x30)
  if (!ladders.length) throw new Error('no ladder down on this level')
  log(`ladder down at ${ladders[0]!.x},${ladders[0]!.y}`)
  s = await d.dungeonWalkTo(ladders[0]!.x, ladders[0]!.y, { onBattle: (b) => log(`  fought a wandering battle: ${b.outcome} in ${b.turns} turns`) })
  s = await d.ladder('down')
  log(`descended: ${where(s)}`)
  const ok = s.location === DESPISE && s.dungeonLevel === 1
  log(ok ? 'PASS: fought a room battle and reached level 2' : `FAIL: ${where(s)}`)
  process.exitCode = ok ? 0 : 1

  if (process.argv.includes('--close')) {
    process.kill(d.pid)
    log('test game closed')
  } else {
    log(`test game left running (DOSBox ${d.pid}) for inspection`)
  }
  d.close()
}

main().catch((err) => {
  log(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 2
})
