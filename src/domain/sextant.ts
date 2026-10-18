// Ultima IV sextant notation: each axis is two letters A–P, the 16-tile block then
// the tile within it. Verified against in-game dialogue (Garam: the bell at
// lat-N'A" long-L'A" = 176,208; Virgil: nightshade at lat-J'F" long-C'O" = 46,149).
const L = (n: number) => String.fromCharCode(65 + n)

export function toSextant(x: number, y: number): string {
  return `lat-${L(y >> 4)}'${L(y & 15)}" long-${L(x >> 4)}'${L(x & 15)}"`
}
