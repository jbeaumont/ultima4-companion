// Research for #68: find where TITLE.EXE keeps the fortune teller's cards in memory.
// Starts Initiate New Game on empty test saves with a recognisable name, finds the
// title program's statics by that name (u4-decompiled TITLE_1.C: player_name at
// D_6948, tmp_int at +0x14, tmp_karma[8] at +0x16, curQuestionIndex at -2), then for
// each of the seven questions snapshots the data segment, answers A, and records
// the winner (card A is always the earlier virtue). Offsets that held the winner
// before every answer are where the shown pair lives (C_2C12's stack locals).
//   npx tsx scripts/hillclimb/fortune-research.ts <outDir>
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchGame } from '../../src/main/launcher'
import { ProcessReader, dosboxProcesses, isTestDosbox } from '../../src/main/memory/win32'
import { GameDriver } from '../driver/driver'

const GAME = process.env['U4_DIR'] || 'C:/Program Files/GOG Galaxy/Games/Ultima 4'
const TEST_DATA = join(process.env['APPDATA']!, 'ultima4-companion-test')
const OVERLAY = join(TEST_DATA, 'game-saves')
const OUT = process.argv[2] ?? join(process.cwd(), 'hillclimb-out')
const NAME = 'qzxfort'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const t0 = Date.now()
const log = (m: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`)

function cdp(expr: string): unknown {
  return JSON.parse(execFileSync('node', ['scripts/cdp.mjs', '9241', 'eval', expr], { encoding: 'utf8' }))
}

function findName(reader: ProcessReader): bigint | null {
  const needles = [NAME, NAME.toUpperCase()].map((n) => Buffer.from(`${n}\0`, 'latin1'))
  for (const r of reader.regions(0x100000)) {
    for (let off = 0; off < r.size; off += 0x100000) {
      const len = Math.min(0x100000 + 32, r.size - off)
      const buf = reader.read(r.base + BigInt(off), len)
      if (!buf) continue
      const b = Buffer.from(buf)
      for (const n of needles) {
        const i = b.indexOf(n)
        // the statics block: karma (8 x 50) sits 0x16 after the name
        if (i >= 0 && b[i + 0x16] === 50 && b[i + 0x1d] === 50) return r.base + BigInt(off + i)
      }
    }
  }
  return null
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  if ((await dosboxProcesses()).some((p) => isTestDosbox(p.commandLine))) throw new Error('A test game is already running; close it first')
  log(`seed empty saves: ${JSON.stringify(cdp("window.u4.seedTestSaves('empty')"))}`)
  await launchGame({ profile: 'test', gameDir: GAME, overlayDir: OVERLAY, confDir: TEST_DATA })
  const d = await GameDriver.attach(GAME, [])
  await sleep(3000)
  d.key('space') // title: any key shows the menu
  await sleep(1500)
  d.key('i') // Initiate New Game
  await sleep(2000)
  await d.type(NAME)
  await sleep(1500)
  d.key('m')
  await sleep(1500)

  const reader = ProcessReader.open(d.pid)!
  let name: bigint | null = null
  for (let i = 0; i < 40 && !name; i++) {
    name = findName(reader)
    if (!name) {
      d.key('space')
      await sleep(400)
    }
  }
  if (!name) throw new Error('the title statics were not found')
  const ds = name - 0x6948n
  log(`player_name at 0x${name.toString(16)}; DS base 0x${ds.toString(16)}`)
  const karma = () => [...reader.read(name! + 0x16n, 8)!]
  const question = () => { const b = reader.read(name! - 2n, 2)!; return b[0]! | (b[1]! << 8) }

  const winners: number[] = []
  const snaps: Uint8Array[] = []
  for (let q = 0; q < 7; q++) {
    // advance through the story and "Consider this:" until the question waits for A or B
    const k0 = karma()
    for (let i = 0; i < 60 && question() < q; i++) { d.key('space'); await sleep(250) }
    for (let i = 0; i < 6; i++) { d.key('space'); await sleep(350) }
    snaps.push(reader.read(ds, 0x10000)!)
    d.key('a')
    let k = karma()
    for (let i = 0; i < 20 && k.every((v, j) => v === k0[j]); i++) { await sleep(200); k = karma() }
    const won = k.findIndex((v, j) => v !== k0[j])
    winners.push(won)
    log(`question ${q + 1}: card A won = virtue ${won}; karma ${k.join(',')}`)
  }

  // offsets whose byte equalled the winner before every answer
  const hits: number[] = []
  for (let o = 0; o < 0x10000; o++) if (snaps.every((s, q) => s[o] === winners[q])) hits.push(o)
  log(`candidate offsets for card A (loc_B): ${hits.map((o) => `0x${o.toString(16)}`).join(', ') || 'none'}`)
  for (const o of hits.slice(0, 8)) {
    const near = snaps.map((s) => [...s.slice(o - 4, o + 12)].map((v) => v.toString(16).padStart(2, '0')).join(' '))
    log(`around 0x${o.toString(16)}:\n  ${near.join('\n  ')}`)
  }
  writeFileSync(join(OUT, 'fortune-research.json'), JSON.stringify({ ds: ds.toString(16), winners, hits }, null, 2))
  await sleep(3000)
  process.kill(d.pid)
  d.close()
  reader.close()
}

main().catch((err) => {
  log(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 2
})
