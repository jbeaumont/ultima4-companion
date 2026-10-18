// Hill-climb journey: a poisoned Avatar with enough experience for level 4
// visits Lord British, levels up and asks him for healing. Checks whether the
// companion says a level is waiting, and that it follows the level-up and cure.
//   npx tsx scripts/hillclimb/lord-british.ts <outDir>
// Lord British (u4-decompiled U4_LB.C): on every audience after the first he
// raises anyone whose XP allows (max HP = 100 x level; level 2 at 100 XP, then
// each level doubles). "health" then N heals and cures the party. He sits on the
// castle's second floor at 19,7; the ladder up is at 3,3.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePartySav } from '../../src/parsers/party'
import { encodePartySav } from '../../src/parsers/partyWriter'
import { ENTRANCES } from '../../src/domain/places'
import { launchGame } from '../../src/main/launcher'
import { dosboxProcesses, isTestDosbox } from '../../src/main/memory/win32'
import { GameDriver } from '../driver/driver'
import { Companion } from './companion'

const GAME = process.env['U4_DIR'] ?? 'C:\\Program Files\\GOG Galaxy\\Games\\Ultima 4'
const TEST_DATA = join(process.env['APPDATA']!, 'ultima4-companion-test')
const OVERLAY = join(TEST_DATA, 'game-saves')
const OUT = process.argv[2] ?? join(process.cwd(), 'hillclimb-out')
const CASTLE = 1
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const t0 = Date.now()
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)
const findings: string[] = []
const expect = (ok: boolean, what: string) => {
  log(`${ok ? 'ok  ' : 'GAP '} ${what}`)
  if (!ok) findings.push(what)
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  if ((await dosboxProcesses()).some((p) => isTestDosbox(p.commandLine))) throw new Error('A test game is already running; close it first')
  mkdirSync(OVERLAY, { recursive: true })
  for (const f of ['PARTY.SAV', 'MONSTERS.SAV', 'OUTMONST.SAV', 'DNGMAP.SAV']) {
    const src = join(GAME, 'cloud_saves', f)
    if (existsSync(src)) copyFileSync(src, join(OVERLAY, f))
  }
  const raw = new Uint8Array(readFileSync(join(OVERLAY, 'PARTY.SAV')))
  const s0 = parsePartySav(raw)
  const me = s0.allRecords[0]!
  me.xp = 450 // enough for level 4
  me.hp = me.hpMax // poison costs 2 HP every turn; with 60 HP the Avatar died on the walk (#19)
  me.status = 'P'
  s0.lbIntro = true
  s0.x = ENTRANCES[CASTLE]!.x
  s0.y = ENTRANCES[CASTLE]!.y
  writeFileSync(join(OVERLAY, 'PARTY.SAV'), encodePartySav(s0, raw))
  const names = s0.allRecords.slice(0, Math.max(1, s0.memberCount)).map((r) => r.name)
  log(`test save: ${me.name} ${me.hp}/${me.hpMax} HP, poisoned, ${me.xp} XP, at the castle gate`)

  const c = await Companion.connect()
  const capture = async (tag: string, views: string[]) => {
    const texts: Record<string, string> = {}
    for (const v of views) {
      texts[v] = await c.view(v, 700)
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

  const a = await capture('1-before', ['Dashboard', 'Tracker'])
  expect(/level/i.test(a['Dashboard']!) && /Lord British/i.test(a['Dashboard']!), 'Dashboard says a level is waiting with Lord British')
  expect(/poisoned/i.test(a['Dashboard']!), 'Dashboard warns that the Avatar is poisoned')

  let s = await d.enter()
  log(`in the castle at ${s.x},${s.y}`)
  d.trace = !!process.env['TRACE']
  const tw = Date.now()
  await d.walkTo(3, 3)
  log(`at the ladder after ${Date.now() - tw} ms`)
  await d.press('k')
  await sleep(500)
  log('climbed to the second floor')
  s = await d.walkTo(19, 8)
  log(`before the throne at ${s.x},${s.y}`)
  d.key('t')
  await sleep(150)
  d.key('up')
  s = await d.waitFor((p) => p.allRecords[0]!.hpMax > me.hpMax, 8000, 'the level-up')
  log(`level up: ${s.allRecords[0]!.hp}/${s.allRecords[0]!.hpMax} HP`)
  await sleep(1000)
  await d.type('health')
  await sleep(600)
  d.key('n')
  s = await d.waitFor((p) => p.allRecords[0]!.status === 'G', 8000, 'healing')
  await sleep(500)
  await d.type('bye')
  await sleep(1500)
  const b = await capture('2-after', ['Dashboard', 'Tracker'])
  const hpMax = s.allRecords[0]!.hpMax
  expect(hpMax === 400, `the game raised the Avatar to level 4 (${hpMax} max HP)`)
  expect(new RegExp(`Level 4`).test(b['Dashboard']!), 'Dashboard shows level 4')
  expect(new RegExp(`HP ${hpMax}/${hpMax}`).test(b['Dashboard']!), 'Dashboard shows full HP')
  expect(!/poisoned/i.test(b['Dashboard']!), 'the poison warning is gone')

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
