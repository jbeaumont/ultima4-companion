// Scenario: a two-member party enters the dungeon Despise, explores, and waits
// for monsters to engage. Covers live dungeon tracking, multi-member parties and
// combat HP. Leaves the test game running (pass --close to quit it) so the
// companion can be inspected afterwards.
//   npx tsx scripts/driver/scenarios/dungeon-party.ts [--close]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePartySav } from '../../../src/parsers/party'
import type { PartySave } from '../../../src/parsers/party'
import { encodePartySav } from '../../../src/parsers/partyWriter'
import { ENTRANCES } from '../../../src/domain/places'
import { launchGame } from '../../../src/main/launcher'
import { dosboxProcesses, isTestDosbox } from '../../../src/main/memory/win32'
import { GameDriver } from '../driver'

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

  // test save: the real save, plus Iolo from the template, standing on Despise's entrance
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
  s0.x = ENTRANCES[DESPISE]!.x
  s0.y = ENTRANCES[DESPISE]!.y
  s0.torches = Math.max(s0.torches, 10)
  writeFileSync(join(OVERLAY, 'PARTY.SAV'), encodePartySav(s0, raw))
  const names = s0.allRecords.slice(0, 2).map((r) => r.name)
  log(`test save: ${names.join(' + ')} on Despise's entrance ${s0.x},${s0.y}`)

  await launchGame({ profile: 'test', gameDir: GAME, overlayDir: OVERLAY, confDir: TEST_DATA })
  const d = await GameDriver.attach(GAME, names)
  let s = await d.journeyOnward()
  log(`in game: ${where(s)}; party: ${hp(s)}`)
  if (s.memberCount !== 2) throw new Error(`expected 2 members, got ${s.memberCount}`)

  // enter the dungeon
  s = await d.enter()
  log(`entered: ${where(s)}`)
  if (s.location !== DESPISE || s.dungeonLevel > 7) throw new Error('did not enter Despise')

  // explore: forward where possible, turn when blocked; log every new cell
  const seen = new Set<string>()
  for (let i = 0; i < 40; i++) {
    const before = d.state()
    const r = await d.press('up')
    const after = r.after
    if (after.x === before.x && after.y === before.y && after.dungeonLevel === before.dungeonLevel) {
      await d.press(i % 2 ? 'left' : 'right') // blocked: turn
    }
    const k = `${after.dungeonLevel}:${after.x},${after.y}`
    if (!seen.has(k)) {
      seen.add(k)
      log(`  at ${where(after)}`)
    }
    if (after.location !== DESPISE) break
  }
  s = d.state()
  log(`explored ${seen.size} cells; now ${where(s)}`)

  // wait for monsters: pass turns and watch HP
  const start = d.state()
  let lowest = start
  for (let i = 0; i < 200; i++) {
    await d.press('space')
    const cur = d.state()
    const total = (p: PartySave) => p.members.reduce((n, m) => n + m.hp, 0)
    if (total(cur) < total(lowest)) {
      lowest = cur
      log(`  HP change: ${hp(cur)}`)
    }
    if (total(start) - total(cur) >= 40) break
  }
  const end = d.state()
  log(end.members.some((m, i) => m.hp !== start.members[i]!.hp) ? `combat damage seen: ${hp(end)}` : 'no damage taken (no monsters engaged)')
  log(`final: ${where(end)}; party: ${hp(end)}`)

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
