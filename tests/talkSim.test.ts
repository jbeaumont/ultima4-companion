import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Conversation } from '@parsers/talk'
import { flat, intro, normalizeInput, reply, startSim, transcript } from '@domain/talkSim'
import type { SimState } from '@domain/talkSim'

const npc = (over: Partial<Conversation> = {}): Conversation => ({
  index: 1, questionTrigger: 'none', humilityQuestion: false, turnAwayChance: 0,
  name: 'Joshua', pronoun: 'He', description: 'A wise mage.', job: 'I can help.', health: 'Well.',
  keyword1Response: 'The riddle!', keyword2Response: 'If the eight\nphilosophies', question: 'More?',
  yesResponse: 'What one\nthing?', noResponse: 'Oh.', keyword1: 'HELP', keyword2: 'RIDDLE', ...over
})

const say = (c: Conversation, input: string, s: SimState = startSim()) => reply(c, s, input)

describe('talk simulator', () => {
  it('normalizes input to 4 trimmed uppercase letters', () => {
    expect(normalizeInput('  job please ')).toBe('JOB ')
    expect(normalizeInput('healing')).toBe('HEAL')
  })

  it('answers LOOK, NAME, JOB and HEAL', () => {
    const c = npc()
    expect(say(c, 'look').lines).toEqual(['You see A wise mage.'])
    expect(say(c, 'name').lines).toEqual(['He says: I am Joshua'])
    expect(say(c, 'job').lines).toEqual(['I can help.'])
    expect(say(c, 'health').lines).toEqual(['Well.'])
    expect(intro(c)).toBe('You meet A wise mage.')
  })

  it('matches keywords on their first 4 letters, flattening line breaks', () => {
    const c = npc()
    expect(say(c, 'helping').lines).toEqual(['The riddle!'])
    expect(say(c, 'riddle').lines).toEqual(['If the eight philosophies'])
    expect(say(c, 'ridd').lines).toEqual(['If the eight philosophies'])
    expect(say(c, 'rid').lines).toEqual(['That I cannot help thee with.'])
  })

  it('ends on BYE or empty input and ignores further input', () => {
    const c = npc()
    for (const input of ['bye', ' BYE ', '  ', '']) {
      const r = say(c, input)
      expect(r.lines).toEqual(['Bye.'])
      expect(r.state.ended).toBe(true)
      expect(reply(c, r.state, 'job').lines).toEqual([])
    }
  })

  it('refuses unknown topics, and empty keywords never match', () => {
    const c = npc({ keyword2: '' })
    expect(say(c, 'xyzzy').lines).toEqual(['That I cannot help thee with.'])
    expect(say(c, '   x').lines).toEqual(['That I cannot help thee with.'])
  })

  it('asks the question after the trigger topic and reads Y/N', () => {
    const c = npc({ questionTrigger: 'keyword1' })
    const asked = say(c, 'help')
    expect(asked.lines).toEqual(['The riddle!', 'More?'])
    expect(asked.state.awaitingYesNo).toBe(true)
    const yes = reply(c, asked.state, 'yes')
    expect(yes.lines).toEqual(['What one thing?'])
    expect(yes.state).toEqual({ awaitingYesNo: false, ended: false })
    expect(reply(c, asked.state, 'n').lines).toEqual(['Oh.'])
    expect(reply(c, asked.state, 'maybe').state.awaitingYesNo).toBe(true)
    expect(reply(c, asked.state, '').state.ended).toBe(true)
  })

  it('only asks after the matching topic', () => {
    const c = npc({ questionTrigger: 'job' })
    expect(say(c, 'help').lines).toEqual(['The riddle!'])
    expect(say(c, 'job').lines).toEqual(['I can help.', 'More?'])
    expect(say(npc({ questionTrigger: 'health' }), 'heal').lines).toEqual(['Well.', 'More?'])
    expect(say(npc({ questionTrigger: 'keyword2' }), 'ridd').lines).toEqual(['If the eight philosophies', 'More?'])
  })

  it('builds a labelled transcript', () => {
    const t = transcript(npc({ questionTrigger: 'keyword1' }))
    expect(t.map((r) => r.label)).toEqual(['LOOK', 'NAME', 'JOB', 'HEAL', 'HELP', 'RIDDLE', 'QUESTION (after keyword1)', 'YES', 'NO'])
    expect(transcript(npc()).map((r) => r.label)).not.toContain('YES')
    expect(flat('a\n b\n')).toBe('a b')
  })

  it('handles every real NPC without throwing', () => {
    const towns: { npcs: Conversation[] }[] = JSON.parse(readFileSync('data/dialogue.json', 'utf8'))
    for (const t of towns) {
      for (const c of t.npcs) {
        for (const w of ['look', 'name', 'job', 'heal', c.keyword1, c.keyword2, 'zzzz']) {
          expect(reply(c, startSim(), w).lines.length).toBeGreaterThan(0)
        }
      }
    }
  })
})
