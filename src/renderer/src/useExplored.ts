import { useEffect, useState } from 'react'

/** Fog-of-war bitset from main: initial fetch plus pushes (a new array each time). */
export function useExplored(): [Uint8Array | null, (b: Uint8Array) => void] {
  const [bits, setBits] = useState<Uint8Array | null>(null)
  useEffect(() => {
    let live = true
    window.u4.getExplored().then((b) => live && setBits((cur) => cur ?? b), () => undefined)
    const off = window.u4.onExplored(setBits)
    return () => {
      live = false
      off()
    }
  }, [])
  return [bits, setBits]
}
