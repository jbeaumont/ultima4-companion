// Prompts for the AI sage. Pure (no Electron/SDK) so they can be tested.
// The system prompt is stable per persona + spoiler level (cached); the live game
// state goes in each turn (after the cached prefix) so the prefix survives.
import type { PartySave } from '@parsers/party'
import { ARMOR, CLASSES, ITEM_FLAGS, LOCATIONS, REAGENTS, RUNES, SPELLS, STONES, VIRTUES, WEAPONS, describeTransport } from '@domain/constants'
import type { ItemName } from '@domain/constants'
import { cooldowns } from '@domain/cooldowns'
import { HINTS, maxTier } from '@domain/hints'
import type { SpoilerLevel } from '@domain/hints'
import { PHASE_NAMES, gateState } from '@domain/moongates'
import { progress } from '@domain/progress'

/** The default model: the lowest-cost one (Claude Haiku 5.5); see SAGE_MODELS in request.ts for the others. */
export const SAGE_MODEL = 'claude-haiku-5-5'

export type Persona = 'hawkwind' | 'lordbritish'

export const PERSONAS: Record<Persona, { name: string; voice: string }> = {
  hawkwind: {
    name: 'Hawkwind the Seer',
    voice: 'You are Hawkwind the Seer of Lord British\'s court. You speak calmly and a little archaically, favour questions that make the Avatar reflect, and judge their progress in the virtues kindly but honestly.'
  },
  lordbritish: {
    name: 'Lord British',
    voice: 'You are Lord British, sovereign of Britannia. You are warm, regal and encouraging, speak in a lightly archaic royal voice, and care most that the Avatar grows in all eight virtues.'
  }
}

const SPOILER_RULES: Record<SpoilerLevel, string> = {
  off:
    'Spoilers are OFF. Never reveal locations, coordinates, mantras, words, answers, NPC names to seek, or item positions. ' +
    'You may explain general game mechanics, the meaning of the virtues, and how to read the player\'s own status, and you may encourage them to talk to townsfolk and take notes. ' +
    'If asked for a solution, decline gently and offer a reflective question instead.',
  nudges:
    'Spoilers are limited to NUDGES. You may give only the gentle first-tier hints listed below (or equally vague ones). ' +
    'Never reveal coordinates, mantras, the word of passage, exact item positions, or exact NPC names to ask. If pressed, say the player can raise the spoiler level in the Hints view.',
  full:
    'Spoilers are FULL. You may give clues and full answers from the hint list below when asked, but still offer the gentlest useful hint first unless the player clearly asks for the answer.'
}

/** Stable system prompt for one persona and spoiler level (cache-friendly). */
export function buildSystemPrompt(persona: Persona, level: SpoilerLevel): string {
  const tiers = maxTier(level)
  const lines: string[] = []
  if (tiers > 0) {
    for (const h of HINTS) {
      const shown = h.tiers.slice(0, tiers).map((t, i) => `  ${['Nudge', 'Clue', 'Answer'][i]}: ${t}`)
      lines.push(`- ${h.title} [${h.id}]\n${shown.join('\n')}`)
    }
  }
  return [
    PERSONAS[persona].voice,
    '',
    'You are the in-game advisor inside a companion app for the 1985 computer game Ultima IV: Quest of the Avatar. The person talking to you is playing it now.',
    'Keep answers short (a few sentences), in character, and useful. Plain text only, no Markdown headings or tables.',
    'Each question is followed by a system message with the player\'s current game state, read from their save or live game memory. Trust it over anything said earlier, and refer to it when relevant (for example, which virtues are close to Avatarhood, or what the moons mean right now).',
    'Facts about the game that are not in the hint list or the state may be wrong in your memory; say so rather than inventing specifics such as coordinates or names.',
    '',
    `Spoiler policy: ${SPOILER_RULES[level]}`,
    '',
    tiers > 0 ? `Hint list (only these tiers are allowed at this spoiler level):\n${lines.join('\n')}` : 'No hint list is provided at this spoiler level.'
  ].join('\n')
}

const named = <T extends readonly string[]>(list: T, bits: number) => list.filter((_, i) => (bits & (1 << i)) !== 0)

/** Compact, factual description of the game state sent with each question. */
export function buildStateMessage(p: PartySave | null, source: 'saveFile' | 'memory' | null, level: SpoilerLevel): string {
  if (!p) return 'Game state: unavailable (no save found yet). Answer in general terms.'
  const prog = progress(p)
  const cd = cooldowns(p)
  const gate = gateState(p.trammel, p.felucca)
  const loc = p.location === 0 ? `Britannia surface at ${p.x},${p.y}` : `${LOCATIONS[p.location]?.name ?? `location ${p.location}`}${p.dungeonLevel !== 0xffff ? `, level ${p.dungeonLevel + 1}` : ''}`
  const members = p.allRecords.slice(0, Math.max(1, p.memberCount)).map((m) =>
    `${m.name} (${CLASSES[m.classIndex] ?? '?'}, level ${Math.floor(m.hpMax / 100)}, HP ${m.hp}/${m.hpMax}, status ${m.status}, ${WEAPONS[m.weapon] ?? '?'}, ${ARMOR[m.armor] ?? '?'})`)
  const items = (Object.keys(ITEM_FLAGS) as ItemName[]).filter((k) => (p.items & ITEM_FLAGS[k]) !== 0)
  const reagents = REAGENTS.map((r, i) => [r, p.reagents[i] ?? 0] as const).filter(([, n]) => n > 0).map(([r, n]) => `${r} ${n}`)
  const mixtures = SPELLS.map((s, i) => [s, p.mixtures[i] ?? 0] as const).filter(([, n]) => n > 0).map(([s, n]) => `${s} ${n}`)
  const timer = (t: { ready: boolean; movesLeft: number }) => (t.ready ? 'ready' : `in ${t.movesLeft} moves`)
  return [
    `Game state (${source === 'memory' ? 'live from the running game' : 'from the last save'}):`,
    `Location: ${loc}; ${describeTransport(p.transport)}; ${p.moves} moves.`,
    `Party: ${members.join('; ')}.`,
    `Karma (0 = partial Avatarhood, otherwise higher is closer to it, max 99): ${VIRTUES.map((v, i) => `${v} ${p.karma[i]}`).join(', ')}.`,
    `Partial Avatarhoods: ${prog.avatarCount}/8. Runes: ${named(RUNES, p.runes).join(', ') || 'none'}. Stones: ${named(STONES, p.stones).join(', ') || 'none'}.`,
    `Quest items: ${items.join(', ') || 'none'}. Abyss ready: ${prog.abyssReady ? 'yes' : 'no'}. Required steps done: ${prog.requiredDone}/${prog.requiredTotal}.`,
    `Supplies: ${p.gold} gold, ${Math.floor(p.food / 100)} food, ${p.torches} torches, ${p.gems} gems, ${p.keys} keys. Reagents: ${reagents.join(', ') || 'none'}. Mixtures: ${mixtures.join(', ') || 'none'}.`,
    `Moons: Trammel ${PHASE_NAMES[p.trammel] ?? p.trammel}, Felucca ${PHASE_NAMES[p.felucca] ?? p.felucca}. Open moongate near ${gate.open.near} leads to ${gate.destination.near}.`,
    `Timers: meditation ${timer(cd.meditation)}, camping ${timer(cd.camp)}, virtue conversation ${timer(cd.virtue)}.`,
    `Spoiler level: ${level}.`
  ].join('\n')
}
