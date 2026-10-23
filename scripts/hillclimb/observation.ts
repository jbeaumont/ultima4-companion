// Hill-climb journey: the live view's freshness. Attach, stand still (the view must
// stay LIVE while successful reads keep counting), then close the game (the
// companion must say it is showing the last save, not a live view).
//   npx tsx scripts/hillclimb/observation.ts <outDir>
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePartySav } from '../../src/parsers/party'
import { launchGame } from '../../src/main/launcher'
import { dosboxProcesses, isTestDosbox } from '../../src/main/memory/win32'
import { GameDriver } from '../driver/driver'
import { Companion } from './companion'

const GAME = process.env['U4_DIR'] ?? 'C:\\Program Files\\GOG Galaxy\\Games\\Ultima 4'
const TEST_DATA = join(process.env['APPDATA']!, 'ultima4-companion-test')
const OVERLAY = join(TEST_DATA, 'game-saves')
const OUT = process.argv[2] ?? join(process.cwd(), 'hillclimb-out')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const t0 = Date.now()
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)
const findings: string[] = []
const expect = (ok: boolean, what: string) => {
  log(`${ok ? 'ok  ' : 'GAP '} ${what}`)
  if (!ok) findings.push(what)
}

interface Obs { session: string; sequence: number; observedAt: number; status: string }

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  if ((await dosboxProcesses()).some((p) => isTestDosbox(p.commandLine))) throw new Error('A test game is already running; close it first')
  mkdirSync(OVERLAY, { recursive: true })
  for (const f of ['PARTY.SAV', 'MONSTERS.SAV', 'OUTMONST.SAV', 'DNGMAP.SAV']) {
    const src = join(GAME, 'cloud_saves', f)
    if (existsSync(src)) copyFileSync(src, join(OVERLAY, f))
  }
  const s0 = parsePartySav(new Uint8Array(readFileSync(join(OVERLAY, 'PARTY.SAV'))))
  const names = s0.allRecords.slice(0, Math.max(1, s0.memberCount)).map((r) => r.name)

  const c = await Companion.connect()
  const obs = () => c.eval<Obs | null>('window.u4.getState().then((s) => s && s.observation ? s.observation : null)')
  const chip = () => c.eval<string>(`[...document.querySelectorAll('.d-chip')].map((e) => e.textContent).find((t) => /LIVE|Save file|Game closed/.test(t)) ?? ''`)
  await launchGame({ profile: 'test', gameDir: GAME, overlayDir: OVERLAY, confDir: TEST_DATA })
  const d = await GameDriver.attach(GAME, names)
  await d.journeyOnward()
  await c.until('window.u4.getState().then((s) => s && s.source === "memory")', 15000)
  await c.view('Dashboard')

  // stand still: no keys for 8 s
  const a = await obs()
  await sleep(8000)
  const b = await obs()
  log(`observation: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`)
  expect(!!a && !!b && a.session === b.session, 'one session while attached')
  expect(!!a && !!b && b.sequence > a.sequence, 'successful reads keep counting while nothing changes')
  expect(b?.status === 'live' && Date.now() - b.observedAt < 4000, 'a standing party is still a fresh live view')
  const liveChip = await chip()
  expect(/LIVE \(memory\)/.test(liveChip), `Dashboard says LIVE ("${liveChip}")`)
  writeFileSync(join(OUT, 'live-Dashboard.txt'), await c.view('Dashboard', 500))

  // close the game: the companion falls back to the save and must say so
  process.kill(d.pid)
  d.close()
  await c.until('window.u4.getState().then((s) => s && s.source === "saveFile")', 15000)
  await sleep(1200)
  const after = await obs()
  const closedChip = await chip()
  log(`after closing: ${JSON.stringify(after)}; chip "${closedChip}"`)
  expect(after?.status === 'detached', 'the fallback is marked detached')
  expect(/Game closed/.test(closedChip), 'Dashboard says the game closed and shows the last save')

  writeFileSync(join(OUT, 'findings.txt'), findings.join('\n'))
  log(`${findings.length} gap(s); captures in ${OUT}`)
  c.close()
}

main().catch((err) => {
  log(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 2
})
