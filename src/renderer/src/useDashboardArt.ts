import { useEffect, useState } from 'react'
import { AVATAR_TILE, VIRTUE_IMAGES, cardRects, classTile, crop, indicesToRgbaKeyed } from '@domain/dashboardArt'
import { decodeEgaImage } from '@parsers/egaImage'
import { TILE_SIZE, parseShapes } from '@parsers/shapes'

export interface DashboardArt {
  /** Virtue name -> card data URL. */
  virtues: Record<string, string>
  avatar: string
  /** Class index -> sprite data URL. */
  classes: string[]
}

const toUrl = (rgba: Uint8ClampedArray, w: number, h: number): string => {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.putImageData(new ImageData(rgba as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0)
  return canvas.toDataURL('image/png')
}

async function build(): Promise<DashboardArt | null> {
  const base = await window.u4.getBaseAssets()
  if (!base) return null
  const tiles = parseShapes(base.shapes)
  const sprite = (t: number) => toUrl(indicesToRgbaKeyed(tiles[t]!, true), TILE_SIZE, TILE_SIZE)
  const virtues: Record<string, string> = {}
  for (const { file, virtues: names } of VIRTUE_IMAGES) {
    const bytes = await window.u4.getImage(file)
    const img = bytes && decodeEgaImage(file, bytes)
    if (!img) continue
    cardRects(img.pixels, img.width, img.height).forEach((r, i) => {
      if (r) virtues[names[i]!] = toUrl(indicesToRgbaKeyed(crop(img.pixels, img.width, r), false), r.w, r.h)
    })
  }
  return { virtues, avatar: sprite(AVATAR_TILE), classes: Array.from({ length: 8 }, (_, c) => sprite(classTile(c))) }
}

// decoded once per game folder; failures resolve to null (the view falls back to text)
const cache = new Map<string, Promise<DashboardArt | null>>()

/** Virtue card art and sprites decoded from the player's own game files. */
export function useDashboardArt(gameDir: string | null): DashboardArt | null {
  const [art, setArt] = useState<DashboardArt | null>(null)
  useEffect(() => {
    setArt(null)
    if (!gameDir) return
    let live = true
    let p = cache.get(gameDir)
    if (!p) {
      p = build().catch(() => null)
      cache.set(gameDir, p)
    }
    void p.then((a) => {
      if (live) setArt(a)
    })
    return () => {
      live = false
    }
  }, [gameDir])
  return art
}
