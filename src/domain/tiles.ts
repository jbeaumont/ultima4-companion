// Terrain names for the first SHAPES tiles; the rest are unnamed for now.
const NAMES = [
  'Deep Water', 'Water', 'Shallow Water', 'Swamp', 'Grassland', 'Scrubland', 'Forest', 'Hills',
  'Mountains', 'Dungeon Entrance', 'Town', 'Castle', 'Village', 'LB Castle (W)', 'LB Castle Entrance', 'LB Castle (E)'
] as const

export const tileName = (tile: number): string => NAMES[tile] ?? `Tile #${tile}`
