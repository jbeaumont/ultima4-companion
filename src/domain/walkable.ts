// Movement cost of each SHAPES tile for a party on foot, derived from xu4's
// tile rules (module/Ultima-IV/config.b: tileset order + tile-rules). Tiles not
// listed are impassable. Costs steer routes away from slow or harmful ground.
const COST: Record<number, number> = {
  3: 6, // swamp (slow, poisons)
  4: 1, // grass
  5: 2, // brush (vslow)
  6: 2, // forest (brush rule)
  7: 3, // hills (vvslow)
  9: 1, // dungeon entrance (walking onto it does not enter)
  10: 1, // city
  11: 1, // castle
  12: 1, // town
  14: 1, // Lord British's castle entrance
  22: 1, // dungeon floor
  23: 1, // bridge
  25: 1, // bridge north end
  26: 1, // bridge south end
  27: 1, // ladder up
  28: 1, // ladder down
  29: 1, // ruins
  30: 1, // shrine (walking onto it does not enter)
  59: 2, // door: walking into it opens it
  60: 1, // chest
  62: 1, // brick floor
  63: 1, // wood floor
  74: 1 // altar
}

/** Cost to step onto `tile`, or null if a party on foot cannot. */
export const stepCost = (tile: number): number | null => COST[tile] ?? null

/** Tiles that are fine to stand on but should only be used as a destination. */
export const DESTINATION_ONLY = new Set([9, 10, 11, 12, 14, 30])
