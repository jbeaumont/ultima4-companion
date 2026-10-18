// Hill-climb journey: consult Hawkwind about two virtues, one ready for
// Elevation and one far from it. Checks the companion matches his verdicts and
// explains that the visit uses the meditation timer.
//   npx tsx scripts/hillclimb/hawkwind.ts <outDir>
// Hawkwind (u4-decompiled U4_SHOPS.C SHP_hawkwind) sits behind the counter in
// the west room of Lord British's castle (door at 6,19; talk south across the
// counter letters on row 25). He ranks a virtue below 20 / 40 / 60 / 99, and at
// 99 sends you to meditate. Leaving gives +3 Spirituality once per hundred moves,
// sharing the meditation timer.
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
  s0.karma[0] = 99 // Honesty: ready for Elevation
  s0.karma[1] = 30 // Compassion: far from it
  s0.moves = Math.max(s0.moves, 150)
  s0.lastMeditation = 0
  s0.x = ENTRANCES[CASTLE]!.x
  s0.y = ENTRANCES[CASTLE]!.y
  writeFileSync(join(OVERLAY, 'PARTY.SAV'), encodePartySav(s0, raw))
  const names = s0.allRecords.slice(0, Math.max(1, s0.memberCount)).map((r) => r.name)
  log('test save: Honesty 99, Compassion 30, meditation ready, at the castle gate')

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

  const a = await capture('1-before', ['Dashboard', 'Journal'])
  expect(/meditate|Elevation|ready/i.test(a['Dashboard']!.slice(a['Dashboard']!.indexOf('THE EIGHT VIRTUES'), a['Dashboard']!.indexOf('QUEST OF'))), 'virtue cards say Honesty is ready for Elevation, as Hawkwind will')

  expect(/SUGGESTED NEXT\s*Elevation in Honesty/i.test(a['Dashboard']!), 'Suggested next leads with Elevation in Honesty (#29)')

  await d.enter()
  let s = await d.walkTo(9, 24)
  log(`above the counter at ${s.x},${s.y}`)
  // Hawkwind follows the party; wait until he stands across the counter, then line up with him
  for (let i = 0; i < 12; i++) {
    const h = d.npcs().find((n) => (n.tile & 0xfe) === 0x52 && n.x >= 7 && n.x <= 10 && n.y >= 26)
    if (h && h.y === 26) {
      if (h.x !== s.x) s = await d.walkTo(h.x, 24)
      if (d.npcs().find((n) => n.slot === h.slot)!.x === s.x) break
    }
    await d.press('space')
  }
  d.key('t')
  await sleep(200)
  d.key('down')
  await sleep(1500)
  d.key('space') // past the welcome
  await sleep(800)
  const before = d.state()
  await d.type('honesty')
  await sleep(1500)
  d.key('space') // "Go to the Shrine and meditate for three Cycles!"
  await sleep(800)
  await d.type('compassion')
  await sleep(1500)
  await d.type('bye')
  s = await d.waitFor((p) => p.karma[6] !== before.karma[6], 6000, 'the farewell Spirituality gain')
  log(`Spirituality ${before.karma[6]} -> ${s.karma[6]}; meditation timer now ${s.lastMeditation} (moves ${s.moves})`)
  expect(s.karma[6] === Math.min(99, before.karma[6]! + 3), 'leaving Hawkwind adds 3 Spirituality')
  await sleep(1000)
  const b = await capture('2-after', ['Dashboard', 'Journal'])
  expect(/Meditation( \/ Hawkwind)?\s*in \d+ moves/i.test(b['Dashboard']!), 'the meditation timer is running after the visit')
  expect(/Hawkwind/i.test(b['Dashboard']!) || /Hawkwind/i.test(b['Journal']!), 'the companion explains Hawkwind uses the meditation timer')

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
