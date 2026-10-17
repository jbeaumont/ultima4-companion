// Small pure label helpers for the Journal view.

/** Moon "steps" are phase changes; real time per step depends on how the game is played. */
export function routeLabel(steps: number | null): string {
  if (steps === null) return 'never'
  if (steps === 0) return 'now'
  return `in ${steps} phase change${steps === 1 ? '' : 's'}`
}

export function timerLabel(t: { ready: boolean; movesLeft: number }): string {
  return t.ready ? 'Ready' : `in ${t.movesLeft} move${t.movesLeft === 1 ? '' : 's'}`
}

export const newClueId = (now: number, rand: number): string => `${now.toString(36)}-${Math.floor(rand * 1e6).toString(36)}`
