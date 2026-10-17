// World-map entrances (xu4 module/Ultima-IV/maps.b portals), keyed by LOCATIONS id.
// Towns and castles are visible on the map anyway; dungeon and shrine positions are
// mild spoilers, so the UI decides when to show them.
export const ENTRANCES: Record<number, { x: number; y: number }> = {
  1: { x: 86, y: 107 }, 2: { x: 218, y: 107 }, 3: { x: 28, y: 50 }, 4: { x: 146, y: 241 },
  5: { x: 232, y: 135 }, 6: { x: 82, y: 106 }, 7: { x: 36, y: 222 }, 8: { x: 58, y: 43 },
  9: { x: 159, y: 20 }, 10: { x: 106, y: 184 }, 11: { x: 22, y: 128 }, 12: { x: 187, y: 169 },
  13: { x: 98, y: 145 }, 14: { x: 136, y: 158 }, 15: { x: 201, y: 59 }, 16: { x: 136, y: 90 },
  17: { x: 240, y: 73 }, 18: { x: 91, y: 67 }, 19: { x: 72, y: 168 }, 20: { x: 126, y: 20 },
  21: { x: 156, y: 27 }, 22: { x: 58, y: 102 }, 23: { x: 239, y: 240 }, 24: { x: 233, y: 233 },
  25: { x: 233, y: 66 }, 26: { x: 128, y: 92 }, 27: { x: 36, y: 229 }, 28: { x: 73, y: 11 },
  29: { x: 205, y: 45 }, 30: { x: 81, y: 207 }, 32: { x: 231, y: 216 }
  // 31 (Spirituality) has no map entrance: it is reached through a moongate.
}

/** Hidden quest-item search spots (xu4 labels). Full spoilers: reveal only via hints. */
export const SECRET_SPOTS = {
  mandrake1: { x: 182, y: 54 },
  mandrake2: { x: 100, y: 165 },
  nightshade1: { x: 46, y: 149 },
  nightshade2: { x: 205, y: 44 },
  bell: { x: 176, y: 208 },
  horn: { x: 45, y: 173 },
  wheel: { x: 96, y: 215 },
  skull: { x: 197, y: 245 },
  blackStone: { x: 224, y: 133 },
  whiteStone: { x: 64, y: 80 }
} as const
