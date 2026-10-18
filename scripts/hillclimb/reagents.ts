// Hill-climb journey: a poisoned Avatar with no Ginseng or Garlic buys two of
// each at Moonglow's Magical Herbs and mixes Cure. Checks the companion's
// reagent and mixture counts, and that the poison advice moves from "mix Cure"
// to "cast Cure".
//   npx tsx scripts/hillclimb/reagents.ts <outDir>
// Shop (u4-decompiled U4_SHOPS.C SHP_reagent): talk north across the counter
// letters to the merchant (row 25); Y, item letter, quantity, payment; "Anything
// else?" N. Each honest purchase adds 2 Honesty, Justice and Honor; paying short
// takes them away. Mixing (U4_MIX.C): M, spell letter, reagent letters, Enter;
// Escape leaves the next "For Spell:" prompt.
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
const GINSENG = 1
const GARLIC = 2
const CURE = 2
const PRICES = [2, 5, 6, 3, 6, 9] // Magical Herbs (D_4190[0])
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
  me.status = 'P'
  me.hp = me.hpMax
  s0.reagents[GINSENG] = 0
  s0.reagents[GARLIC] = 0
  s0.mixtures[CURE] = 0
  s0.gold = Math.max(s0.gold, 100)
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
  await d.journeyOnward()
  await c.until('window.u4.getState().then((s) => s && s.source === "memory")', 15000)

  const a = await capture('1-before', ['Dashboard', 'Tracker'])
  expect(/mix Cure: Ginseng \+ Garlic/i.test(a['Dashboard']!), 'poison advice says how to mix Cure')

  await d.walkTo(232, 135)
  await d.enter()
  // stand below the counter, under the merchant (who wanders along row 25)
  let s = d.state()
  for (let tries = 0; tries < 10; tries++) {
    const m = d.npcs().find((n) => (n.tile & 0xfe) === 0x52 && n.y === 25)
    if (!m) throw new Error('no merchant behind the Magical Herbs counter')
    s = await d.walkTo(m.x, 27)
    const now = d.npcs().find((n) => n.slot === m.slot)!
    if (now.x === s.x && now.y === 25) break
  }
  log(`at the counter ${s.x},${s.y}; gold ${s.gold}, karma ${s.karma.slice(0, 6).join(',')}`)
  const before = d.state()

  // buy 2 Ginseng and 2 Garlic, paying the full price
  d.key('t')
  await sleep(200)
  d.key('up')
  await sleep(1200)
  d.key('y')
  await sleep(600)
  for (const [i, item] of [[GINSENG, 'b'], [GARLIC, 'c']] as const) {
    d.key(item)
    await sleep(500)
    await d.type('2')
    await sleep(500)
    await d.type(String(2 * PRICES[i]!))
    await d.waitFor((p) => p.reagents[i] === 2, 5000, `the ${item === 'b' ? 'Ginseng' : 'Garlic'} purchase`)
    await sleep(400)
    d.key(item === 'b' ? 'y' : 'n') // anything else?
    await sleep(600)
  }
  s = d.state()
  log(`bought: ginseng ${s.reagents[GINSENG]}, garlic ${s.reagents[GARLIC]}, gold ${before.gold} -> ${s.gold}`)
  expect(before.gold - s.gold === 2 * PRICES[GINSENG]! + 2 * PRICES[GARLIC]!, 'paid the listed prices')
  const honest = [0, 3, 5].every((v) => s.karma[v] === Math.min(99, before.karma[v]! + 4) || before.karma[v] === 0)
  expect(honest, `two honest purchases add 4 Honesty, Justice and Honor (${[0, 3, 5].map((v) => `${before.karma[v]}->${s.karma[v]}`).join(', ')})`)

  const mid = await capture('2-bought', ['Dashboard', 'Tracker'])
  expect(/Ginseng\s*2/.test(mid['Tracker']!) && /Garlic\s*2/.test(mid['Tracker']!), 'Tracker shows the new reagents')

  // mix Cure
  d.key('m')
  await sleep(500)
  d.key('c')
  await sleep(500)
  d.key('b')
  await sleep(300)
  d.key('c')
  await sleep(300)
  d.key('enter')
  s = await d.waitFor((p) => p.mixtures[CURE] === 1, 5000, 'the Cure mixture')
  await sleep(500)
  d.key('escape')
  await sleep(1000)
  log(`mixed: Cure ${s.mixtures[CURE]}, ginseng ${s.reagents[GINSENG]}, garlic ${s.reagents[GARLIC]}`)

  const b = await capture('3-mixed', ['Dashboard', 'Tracker'])
  expect(/Cure\s*1/.test(b['Tracker']!), 'Tracker shows one Cure mixture')
  expect(/Cast Cure \(1 mixed\)/.test(b['Dashboard']!), 'poison advice now says to cast Cure')

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
