import { describe, expect, it } from 'vitest'
import { CYCLE_STEP, SPEEDS, cyclesFromTitle, speedOf } from '@shared/speed'
import { buildConf } from '../src/main/launcher'

describe('game speed', () => {
  it("reads the speed from DOSBox's window title", () => {
    expect(cyclesFromTitle('DOSBox 0.74-2.1, Cpu speed:      500 cycles, Frameskip  0, Program:   AVATAR')).toBe(500)
    expect(cyclesFromTitle('DOSBox 0.74-2.1, Cpu speed:    10000 cycles, Frameskip  0, Program:   AVATAR')).toBe(10000)
    expect(cyclesFromTitle('DOSBox 0.74-2.1, Cpu speed: max 100% cycles, Frameskip  0, Program:   AVATAR')).toBe('max')
    expect(cyclesFromTitle('Ultima IV Companion')).toBeNull()
    expect(speedOf(3000)).toBe('faster')
    expect(speedOf(3500)).toBeNull()
  })

  it('presets are whole steps apart, so Ctrl+F11/F12 can land on each', () => {
    for (const c of Object.values(SPEEDS)) expect((c - SPEEDS.original) % CYCLE_STEP).toBe(0)
  })

  it('the play config starts at the chosen speed with a large step; test stays at max', () => {
    const base = { gameDir: 'C:/g', overlayDir: 'C:/o' }
    const play = buildConf({ ...base, profile: 'play', cycles: SPEEDS.faster })
    expect(play).toMatch(/^cycles=3000$/m)
    expect(play).toMatch(new RegExp(`^cycleup=${CYCLE_STEP}$`, 'm'))
    expect(buildConf({ ...base, profile: 'play' })).not.toMatch(/^cycles=/m) // GOG's own 500
    expect(buildConf({ ...base, profile: 'test' })).toMatch(/^cycles=max$/m)
  })
})
