// Hill-climb journey: check the Spellbook against the game (#79). With five of every
// reagent, mixes Gate and Undead (recipes the manual withholds) from the
// Spellbook's data, mixes Heal from the wrong reagents (it must fizzle and still
// use them), and casts Light outdoors (Dungeons only: the mixture is used, the MP
// is not). Then checks the companion shows the withheld recipes once mixed.
//   npx tsx scripts/hillclimb/spellbook.ts <outDir>
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parsePartySav } from '../../src/parsers/party'
import type { PartySave } from '../../src/parsers/party'
import { encodePartySav } from '../../src/parsers/partyWriter'
import { SPELLBOOK, reagentsOf } from '../../src/domain/spells'
import { launchGame } from '../../src/main/launcher'
import { dosboxProcesses, isTestDosbox } from '../../src/main/memory/win32'
import { GameDriver } from '../driver/driver'
import { Companion } from './companion'

const GAME = process.env['U4_DIR'] || 'C:/Program Files/GOG Galaxy/Games/Ultima 4'
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
const spell = (letter: string) => SPELLBOOK.findIndex((s) => s.letter === letter)
const letters = (idx: number[]) => idx.map((i) => 'abcdefgh'[i]!)

async function mix(d: GameDriver, letter: string, reagentKeys: string[]): Promise<void> {
  d.key('m')
  await sleep(500)
  d.key(letter.toLowerCase())
  await sleep(500)
  for (const k of reagentKeys) {
    d.key(k)
    await sleep(300)
  }
  d.key('enter')
  await sleep(800)
  d.key('escape')
  await sleep(800)
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
  s0.reagents = s0.reagents.map(() => 5)
  s0.mixtures = s0.mixtures.map(() => 0)
  s0.allRecords[0]!.mp = 99
  writeFileSync(join(OVERLAY, 'PARTY.SAV'), encodePartySav(s0, raw))
  const names = s0.allRecords.slice(0, Math.max(1, s0.memberCount)).map((r) => r.name)

  const c = await Companion.connect()
  await c.freshJournal()
  await c.eval("window.u4.getJournal().then((j) => window.u4.saveJournal({ ...j, spoilerLevel: 'nudges' }))")
  await launchGame({ profile: 'test', gameDir: GAME, overlayDir: OVERLAY, confDir: TEST_DATA })
  const d = await GameDriver.attach(GAME, names)
  let s: PartySave = await d.journeyOnward()
  await c.until('window.u4.getState().then((s) => s && s.source === "memory")', 15000)
  if (s.location !== 0) throw new Error('start outdoors for the Light check')

  const before = await c.view('Spellbook', 800)
  expect(/Gate[^]*?Not in the manual/.test(before), 'before mixing, the Gate recipe is withheld at Nudges')

  for (const letter of ['G', 'U']) {
    const i = spell(letter)
    await mix(d, letter, letters(reagentsOf(SPELLBOOK[i]!.mask)))
    s = d.state()
    expect(s.mixtures[i] === 1, `mixing ${SPELLBOOK[i]!.name} from the Spellbook's recipe works in the game`)
  }

  const heal = spell('H')
  const gin = s.reagents[1]!, gar = s.reagents[2]!
  await mix(d, 'H', ['b', 'c']) // ginseng + garlic: that is Cure's recipe, not Heal's
  s = d.state()
  expect(s.mixtures[heal] === 0 && s.reagents[1] === gin - 1 && s.reagents[2] === gar - 1, 'a wrong recipe fizzles and still uses the reagents')

  const light = spell('L')
  await mix(d, 'L', ['a'])
  s = d.state()
  expect(s.mixtures[light] === 1, 'Light mixes from ash alone')
  const mp = s.allRecords[0]!.mp
  await d.castSpell('l', { caster: 0 })
  await sleep(1000)
  s = d.state()
  expect(s.mixtures[light] === 0 && s.allRecords[0]!.mp === mp, 'Light outdoors fails (Dungeons only): the mixture is used, the MP is not')

  await sleep(1000)
  const after = await c.view('Spellbook', 800)
  writeFileSync(join(OUT, 'Spellbook.txt'), after)
  expect(/Gate[^]*?Sulfurous Ash[^]*?Black Pearl[^]*?Mandrake Root[^]*?1 mixture/.test(after), 'once mixed, the companion shows the Gate recipe and the mixture')
  expect(/Undead[^]*?Sulfurous Ash[^]*?Garlic/.test(after), 'once mixed, the companion shows the Undead recipe')

  writeFileSync(join(OUT, 'findings-spellbook.txt'), findings.join('\n'))
  log(`${findings.length} gap(s)`)
  process.kill(d.pid)
  d.close()
  c.close()
}

main().catch((err) => {
  log(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 2
})
