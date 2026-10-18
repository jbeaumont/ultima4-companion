// Hill-climb journey: meditate at the Shrine of Honesty with its mantra for three
// cycles. Checks what the companion says before (timer ready, mantra hint) and
// after (Spirituality gain, meditation timer running).
//   npx tsx scripts/hillclimb/shrine.ts <outDir>
// Shrine flow (u4-decompiled U4_SHRIN.C): E on the shrine, type the virtue, pick
// cycles 1-3; each cycle is 16 one-second dots then a "Mantra:" prompt. One
// meditation per hundred moves; success adds 3 Spirituality per cycle.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePartySav } from '../../src/parsers/party'
import { encodePartySav } from '../../src/parsers/partyWriter'
import { ENTRANCES } from '../../src/domain/places'
import { launchGame } from '../../src/main/launcher'
import { dosboxProcesses, isTestDosbox } from '../../src/main/memory/win32'
import { GameDriver, MODE } from '../driver/driver'
import { Companion } from './companion'

const GAME = process.env['U4_DIR'] ?? 'C:\\Program Files\\GOG Galaxy\\Games\\Ultima 4'
const TEST_DATA = join(process.env['APPDATA']!, 'ultima4-companion-test')
const OVERLAY = join(TEST_DATA, 'game-saves')
const OUT = process.argv[2] ?? join(process.cwd(), 'hillclimb-out')
const SHRINE = 25 // Honesty
const SPIRITUALITY = 6
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

  // test save: the real save (it has the Rune of Honesty) standing on the shrine, past the meditation cooldown
  mkdirSync(OVERLAY, { recursive: true })
  for (const f of ['PARTY.SAV', 'MONSTERS.SAV', 'OUTMONST.SAV', 'DNGMAP.SAV']) {
    const src = join(GAME, 'cloud_saves', f)
    if (existsSync(src)) copyFileSync(src, join(OVERLAY, f))
  }
  const raw = new Uint8Array(readFileSync(join(OVERLAY, 'PARTY.SAV')))
  const s0 = parsePartySav(raw)
  if (!(s0.runes & 1)) throw new Error('the save has no Rune of Honesty')
  s0.x = ENTRANCES[SHRINE]!.x
  s0.y = ENTRANCES[SHRINE]!.y
  s0.moves = Math.max(s0.moves, 150)
  s0.lastMeditation = 0
  writeFileSync(join(OVERLAY, 'PARTY.SAV'), encodePartySav(s0, raw))
  const names = s0.allRecords.slice(0, Math.max(1, s0.memberCount)).map((r) => r.name)

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
  let s = await d.journeyOnward()
  await c.until('window.u4.getState().then((s) => s && s.source === "memory")', 15000)
  log(`on the shrine at ${s.x},${s.y}, moves ${s.moves}, Spirituality ${s.karma[SPIRITUALITY]}`)

  const a = await capture('1-before', ['Dashboard', 'Journal', 'Hints'])
  expect(/Meditation\s*ready/i.test(a['Dashboard']!), 'Dashboard timer says meditation is ready')
  expect(/Mantra of Honesty/i.test(a['Hints']!), 'Hints offer the Mantra of Honesty')

  // enter and meditate
  d.key('e')
  await d.waitFor(() => d.mode() === MODE.shrine, 5000, 'the shrine')
  log('in the shrine')
  await sleep(500)
  await d.type('honesty')
  await sleep(300)
  d.key('3')
  s = await d.waitFor((p) => p.lastMeditation === Math.floor(p.moves / 100), 5000, 'meditation to begin')
  let mark = Date.now() // the dots start now; the game drops keys typed before the prompt
  log('meditating')
  const spirit0 = s.karma[SPIRITUALITY]!
  const mid = await capture('2-meditating', ['Dashboard'])
  for (let cycle = 1; cycle <= 3; cycle++) {
    await sleep(Math.max(0, mark + 18000 - Date.now())) // 16 one-second dots, plus margin
    await d.type('ahm')
    mark = Date.now()
    log(`mantra ${cycle}`)
  }
  s = await d.waitFor((p) => p.karma[SPIRITUALITY] !== spirit0, 8000, 'the vision (Spirituality change)')
  log(`Spirituality ${spirit0} -> ${s.karma[SPIRITUALITY]}`)
  for (let i = 0; i < 4 && d.mode() === MODE.shrine; i++) {
    d.key('space')
    await sleep(700)
  }
  expect(d.mode() === MODE.outdoors, 'left the shrine')
  await sleep(1000)
  const b = await capture('3-after', ['Dashboard', 'Journal'])

  expect(s.karma[SPIRITUALITY] === Math.min(99, spirit0 + 9), 'three cycles with the right mantra add 9 Spirituality')
  expect(new RegExp(`${s.karma[SPIRITUALITY]}\\s*/\\s*99`).test(b['Dashboard']!), 'Dashboard shows the new Spirituality')
  expect(/Meditation\s*in \d+ moves/i.test(b['Dashboard']!), 'Dashboard meditation timer is running again')
  expect(!/Shrine/i.test(mid['Dashboard']!) || /Shrine of Honesty/i.test(mid['Dashboard']!), 'Dashboard names the shrine while inside')

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
