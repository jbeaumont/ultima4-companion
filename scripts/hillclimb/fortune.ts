// Hill-climb journey for the fortune teller (#68): for each class, start Initiate
// New Game on empty test saves, tell the test companion to answer for that class,
// press Space through the story, and check the new PARTY.SAV: the Avatar has that
// class and its virtue won all three of its rounds (karma 65).
//   npx tsx scripts/hillclimb/fortune.ts <outDir> [class index ...]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CLASSES, VIRTUES } from '../../src/domain/constants'
import { parsePartySav } from '../../src/parsers/party'
import { launchGame } from '../../src/main/launcher'
import { dosboxProcesses, isTestDosbox } from '../../src/main/memory/win32'
import { GameDriver } from '../driver/driver'

const GAME = process.env['U4_DIR'] || 'C:/Program Files/GOG Galaxy/Games/Ultima 4'
const TEST_DATA = join(process.env['APPDATA']!, 'ultima4-companion-test')
const OVERLAY = join(TEST_DATA, 'game-saves')
const OUT = process.argv[2] ?? join(process.cwd(), 'hillclimb-out')
const TARGETS = process.argv.slice(3).map(Number).filter((n) => n >= 0 && n < 8)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const t0 = Date.now()
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)
const findings: string[] = []
const expect = (ok: boolean, what: string) => {
  log(`${ok ? 'ok  ' : 'GAP '} ${what}`)
  if (!ok) findings.push(what)
}
const cdp = (expr: string): unknown => JSON.parse(execFileSync('node', ['scripts/cdp.mjs', '9241', 'eval', expr], { encoding: 'utf8' }))

async function createAs(target: number): Promise<void> {
  if ((await dosboxProcesses()).some((p) => isTestDosbox(p.commandLine))) throw new Error('A test game is already running; close it first')
  cdp("window.u4.seedTestSaves('empty')")
  const save = join(OVERLAY, 'PARTY.SAV')
  if (existsSync(save)) rmSync(save)
  await launchGame({ profile: 'test', gameDir: GAME, overlayDir: OVERLAY, confDir: TEST_DATA })
  const d = await GameDriver.attach(GAME, [])
  try {
    await sleep(3000)
    d.key('space')
    await sleep(1500)
    d.key('i') // Initiate New Game
    await sleep(2000)
    await d.type(`avatar${target}`)
    await sleep(1500)
    d.key('m')
    await sleep(1000)
    cdp(`window.u4.setFortuneAuto(${target})`)
    let seen = false
    // through the story; the companion answers each question, and the game then writes PARTY.SAV
    for (let i = 0; i < 400 && !existsSync(save); i++) {
      const u = cdp('window.u4.getFortune()') as { state: { question: number; cards: unknown } | null }
      if (u.state?.cards) seen = true
      // leave the questions to the companion; elsewhere move the story along
      if (!u.state?.cards) d.key('space')
      await sleep(400)
    }
    expect(seen, `${CLASSES[target]}: the companion read the fortune teller's cards`)
    await sleep(1000)
    if (!existsSync(save)) {
      expect(false, `${CLASSES[target]}: a new game was saved`)
      return
    }
    const p = parsePartySav(new Uint8Array(readFileSync(save)))
    const me = p.allRecords[0]!
    expect(me.classIndex === target, `${CLASSES[target]}: the new Avatar is a ${CLASSES[me.classIndex]}`)
    expect(p.karma[target] === 65, `${CLASSES[target]}: ${VIRTUES[target]} won its three rounds (karma ${p.karma[target]})`)
  } finally {
    cdp('window.u4.setFortuneAuto(null)')
    process.kill(d.pid)
    d.close()
    await sleep(2000)
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  for (const t of TARGETS.length ? TARGETS : [0, 1, 2, 3, 4, 5, 6, 7]) await createAs(t)
  writeFileSync(join(OUT, 'findings-fortune.txt'), findings.join('\n'))
  log(`${findings.length} gap(s)`)
}

main().catch((err) => {
  log(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 2
})
