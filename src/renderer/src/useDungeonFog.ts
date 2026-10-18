import { useEffect, useState } from 'react'

/** Seen-dungeon-cells bitset from main: initial fetch plus pushes (a new array each time). */
export function useDungeonFog(): [Uint8Array | null, (b: Uint8Array) => void] {
  const [bits, setBits] = useState<Uint8Array | null>(null)
  useEffect(() => {
    let live = true
    window.u4.getDungeonFog().then((b) => live && setBits((cur) => cur ?? b), () => undefined)
    const off = window.u4.onDungeonFog(setBits)
    return () => {
      live = false
      off()
    }
  }, [])
  return [bits, setBits]
}
