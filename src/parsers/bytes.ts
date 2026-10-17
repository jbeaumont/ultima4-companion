/** Little-endian byte helpers shared by all parsers. */
export class Reader {
  constructor(public readonly buf: Uint8Array) {}

  u8(off: number): number {
    return this.buf[off] ?? 0
  }

  u16(off: number): number {
    return this.u8(off) | (this.u8(off + 1) << 8)
  }

  u32(off: number): number {
    return (this.u16(off) + this.u16(off + 2) * 0x10000) >>> 0
  }

  /** Zero-terminated string within a fixed-size field. */
  fixedString(off: number, len: number): string {
    let s = ''
    for (let i = 0; i < len; i++) {
      const c = this.u8(off + i)
      if (c === 0) break
      s += String.fromCharCode(c)
    }
    return s
  }
}

export function expectSize(buf: Uint8Array, size: number, what: string): void {
  if (buf.length < size) {
    throw new Error(`${what}: expected at least ${size} bytes, got ${buf.length}`)
  }
}
