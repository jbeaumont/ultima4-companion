// Art gallery grouping for the full-screen .EGA images; pure so tests can check it against the decoders.
import type { SpoilerLevel } from './hints'

export interface GalleryGroup {
  id: string
  title: string
  /** Late-game images: hidden until spoiler level 'full' or a per-image click. */
  spoiler: boolean
  files: string[]
}

export const GALLERY: GalleryGroup[] = [
  {
    id: 'intro', title: 'Intro story', spoiler: false,
    files: ['TREE', 'PORTAL', 'OUTSIDE', 'INSIDE', 'WAGON', 'GYPSY', 'ABACUS', 'HONCOM', 'VALJUS', 'SACHONOR', 'SPIRHUM', 'ANIMATE'].map((n) => `${n}.EGA`)
  },
  { id: 'title', title: 'Title & start', spoiler: false, files: ['TITLE.EGA', 'START.EGA'] },
  {
    id: 'runes', title: 'Runes', spoiler: false,
    files: [...Array.from({ length: 6 }, (_, i) => `RUNE_${i}.EGA`), 'KEY7.EGA']
  },
  { id: 'stones', title: 'Stones', spoiler: false, files: ['STONCRCL.EGA'] },
  {
    id: 'abyss', title: 'Abyss & codex', spoiler: true,
    files: ['HONESTY', 'COMPASSN', 'VALOR', 'JUSTICE', 'SACRIFIC', 'HONOR', 'SPIRIT', 'HUMILITY', 'TRUTH', 'LOVE', 'COURAGE'].map((n) => `${n}.EGA`)
  }
]

/** "SACHONOR.EGA" -> "Sachonor"; underscores become spaces. */
export const imageLabel = (file: string): string => {
  const base = file.replace(/\.EGA$/i, '').replace(/_/g, ' ').toLowerCase()
  return base.charAt(0).toUpperCase() + base.slice(1)
}

/** Whether a spoiler group's images may be shown without a per-image click. */
export const spoilerOpen = (group: GalleryGroup, level: SpoilerLevel): boolean => !group.spoiler || level === 'full'
