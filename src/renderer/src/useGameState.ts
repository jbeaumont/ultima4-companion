import { useEffect, useState } from 'react'
import type { GameState } from '@shared/types'

/** Latest GameState from main: initial fetch plus pushes. */
export function useGameState(): [GameState | null, (s: GameState | null) => void] {
  const [state, setState] = useState<GameState | null>(null)
  useEffect(() => {
    let live = true
    window.u4.getState().then((s) => live && setState((cur) => cur ?? s))
    const off = window.u4.onState(setState)
    return () => {
      live = false
      off()
    }
  }, [])
  return [state, setState]
}
