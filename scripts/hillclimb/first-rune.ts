// Hill-climb journey: a player who has not found the Rune of Honesty walks to
// Moonglow, enters, and finds it. At each checkpoint the test companion's views
// are captured (text + screenshot) for review, and a few expectations checked.
//   npx tsx scripts/hillclimb/first-rune.ts <outDir>
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePartySav } from '../../src/parsers/party'
import { encodePartySav } from '../../src/parsers/partyWriter'
import { launchGame } from '../../src/main/launcher'
import { dosboxProcesses, isTestDosbox } from '../../src/main/memory/win32'
import { GameDriver } from '../driver/driver'
import { Companion } from './companion'

const GAME = process.env['U4_DIR'] ?? 'C:\\Program Files\\GOG Galaxy\\Games\\Ultima 4'
const TEST_DATA = join(process.env['APPDATA']!, 'ultima4-companion-test')
const OVERLAY = join(TEST_DATA, 'game-saves')
const OUT = process.argv[2] ?? join(process.cwd(), 'hillclimb-out')
const VIEWS = ['Dashboard', 'Map', 'Journal', 'Hints', 'Dialogue']
const t0 = Date.now()
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)
const findings: string[] = []
const expect = (ok: boolean, what: string) => {
  log(`${ok ? 'ok  ' : 'GAP '} ${what}`)
  if (!ok) findings.push(what)
}

async function capture(c: Companion, tag: string): Promise<Record<string, string>> {
  const texts: Record<string, string> = {}
  for (const v of VIEWS) {
    texts[v] = await c.view(v, v === 'Map' ? 1500 : 600)
    writeFileSync(join(OUT, `${tag}-${v}.txt`), texts[v]!)
    await c.shot(join(OUT, `${tag}-${v}.png`))
  }
  log(`captured ${tag}`)
  return texts
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  if ((await dosboxProcesses()).some((p) => isTestDosbox(p.commandLine))) throw new Error('A test game is already running; close it first')

  // test save: the real save without the Rune of Honesty
  mkdirSync(OVERLAY, { recursive: true })
  for (const f of ['PARTY.SAV', 'MONSTERS.SAV', 'OUTMONST.SAV', 'DNGMAP.SAV']) {
    const src = join(GAME, 'cloud_saves', f)
    if (existsSync(src)) copyFileSync(src, join(OVERLAY, f))
  }
  const raw = new Uint8Array(readFileSync(join(OVERLAY, 'PARTY.SAV')))
  const save = parsePartySav(raw)
  save.runes &= ~1
  writeFileSync(join(OVERLAY, 'PARTY.SAV'), encodePartySav(save, raw))
  const names = save.allRecords.slice(0, Math.max(1, save.memberCount)).map((r) => r.name)

  const c = await Companion.connect()
  await c.freshJournal() // checks must not pass on an earlier run's journal
  log('companion up')
  await launchGame({ profile: 'test', gameDir: GAME, overlayDir: OVERLAY, confDir: TEST_DATA })
  const d = await GameDriver.attach(GAME, names)
  await d.journeyOnward()
  const t = Date.now()
  const live = await c.until('window.u4.getState().then((s) => s && s.source === "memory")', 15000)
  expect(live, `companion goes live within 15 s of Journey Onward (${Date.now() - t} ms)`)

  // 1. outside Moonglow
  await d.walkTo(232, 135)
  await new Promise((r) => setTimeout(r, 1000))
  const a = await capture(c, '1-outside')
  expect(/Honesty/i.test(a['Dashboard']!) && /Moonglow/i.test(a['Dashboard']!), 'Dashboard points a rune-less player toward Moonglow for the Rune of Honesty')

  // 2. inside Moonglow
  await d.enter()
  await new Promise((r) => setTimeout(r, 1000))
  const b = await capture(c, '2-moonglow')
  expect(/Moonglow/i.test(b['Dashboard']!), 'Dashboard says we are in Moonglow')
  expect(/Moonglow/i.test(b['Map']!), 'Map shows Moonglow')
  expect(!/Choose a settlement/i.test(b['Dialogue']!), 'Dialogue opens on the people of Moonglow')

  // 3. find the rune
  await d.walkTo(8, 6)
  const s = await d.search()
  await new Promise((r) => setTimeout(r, 1500))
  const cc = await capture(c, '3-rune')
  expect((s.runes & 1) !== 0, 'the rune is found in game')
  expect(cc['Dashboard'] !== b['Dashboard'], 'Dashboard changes when the rune is found')
  expect(!/Rune of Honesty/i.test(cc['Dashboard']!.split(/Suggested next/i)[1] ?? ''), 'Rune of Honesty leaves Suggested next')
  expect(/Honesty/i.test(cc['Journal']!) , 'Journal records the Rune of Honesty')

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
