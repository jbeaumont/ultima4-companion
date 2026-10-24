// Measure what game speed (DOSBox cycles) does to Ultima IV's real-time behaviour
// (#70): with no key pressed, how many turns pass and how far the moons move in
// a fixed time, at each speed. Runs the test game once per speed.
//   npx tsx scripts/hillclimb/speed.ts <outDir> [seconds]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePartySav } from '../../src/parsers/party'
import { launchGame } from '../../src/main/launcher'
import { dosboxProcesses, isTestDosbox } from '../../src/main/memory/win32'
import { GameDriver } from '../driver/driver'
import { dosboxTitle } from '../driver/input'

const GAME = process.env['U4_DIR'] || 'C:/Program Files/GOG Galaxy/Games/Ultima 4'
const TEST_DATA = join(process.env['APPDATA']!, 'ultima4-companion-test')
const OVERLAY = join(TEST_DATA, 'game-saves')
const OUT = process.argv[2] ?? join(process.cwd(), 'hillclimb-out')
const SECONDS = Number(process.argv[3] ?? 30)
const SPEEDS: (number | 'max')[] = [500, 3000, 10000, 'max']
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  mkdirSync(OVERLAY, { recursive: true })
  for (const f of ['PARTY.SAV', 'MONSTERS.SAV', 'OUTMONST.SAV', 'DNGMAP.SAV']) {
    const src = join(GAME, 'cloud_saves', f)
    if (existsSync(src)) copyFileSync(src, join(OVERLAY, f))
  }
  const s0 = parsePartySav(new Uint8Array(readFileSync(join(OVERLAY, 'PARTY.SAV'))))
  const names = s0.allRecords.slice(0, Math.max(1, s0.memberCount)).map((r) => r.name)
  const rows: object[] = []
  for (const cycles of SPEEDS) {
    if ((await dosboxProcesses()).some((p) => isTestDosbox(p.commandLine))) throw new Error('A test game is already running; close it first')
    await launchGame({ profile: 'test', gameDir: GAME, overlayDir: OVERLAY, confDir: TEST_DATA, cycles })
    const d = await GameDriver.attach(GAME, names)
    await d.journeyOnward(150000)
    await sleep(1500)
    const a = d.state()
    const moonsA = a.trammel * 8 + a.felucca
    // count moon changes by sampling, since phases wrap
    let moonSteps = 0
    let last = moonsA
    const t0 = Date.now()
    while (Date.now() - t0 < SECONDS * 1000) {
      await sleep(250)
      const s = d.state()
      const m = s.trammel * 8 + s.felucca
      if (m !== last) moonSteps++
      last = m
    }
    const b = d.state()
    const row = { cycles, title: dosboxTitle(d.pid), seconds: SECONDS, idleMoves: b.moves - a.moves, moonChanges: moonSteps, foodUsed: (a.food - b.food) / 100 }
    console.log(JSON.stringify(row))
    rows.push(row)
    process.kill(d.pid)
    d.close()
    await sleep(2000)
  }
  writeFileSync(join(OUT, 'speed.json'), JSON.stringify(rows, null, 2))
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 2
})
