// Read-only access to another process's memory via koffi (no native build step).
// Only PROCESS_VM_READ | PROCESS_QUERY_INFORMATION is ever requested.
import { execFile } from 'node:child_process'
import koffi from 'koffi'

const PROCESS_QUERY_INFORMATION = 0x0400
const PROCESS_VM_READ = 0x0010
const MEM_COMMIT = 0x1000
const MEM_PRIVATE = 0x20000
const PAGE_READWRITE = 0x04

const MBI = koffi.struct('MEMORY_BASIC_INFORMATION64', {
  BaseAddress: 'uint64',
  AllocationBase: 'uint64',
  AllocationProtect: 'uint32',
  __alignment1: 'uint32',
  RegionSize: 'uint64',
  State: 'uint32',
  Protect: 'uint32',
  Type: 'uint32',
  __alignment2: 'uint32'
})

let api: {
  OpenProcess: (access: number, inherit: boolean, pid: number) => unknown
  CloseHandle: (h: unknown) => boolean
  ReadProcessMemory: (h: unknown, addr: bigint, buf: Buffer, size: number, read: [number] | null) => boolean
  VirtualQueryEx: (h: unknown, addr: bigint, info: Record<string, bigint | number>, size: number) => number
} | null = null

function load() {
  if (api) return api
  const k32 = koffi.load('kernel32.dll')
  api = {
    OpenProcess: k32.func('void* __stdcall OpenProcess(uint32 access, bool inherit, uint32 pid)'),
    CloseHandle: k32.func('bool __stdcall CloseHandle(void* h)'),
    ReadProcessMemory: k32.func('bool __stdcall ReadProcessMemory(void* h, uint64 addr, _Out_ uint8_t* buf, size_t size, _Out_ size_t* read)'),
    VirtualQueryEx: k32.func('size_t __stdcall VirtualQueryEx(void* h, uint64 addr, _Out_ MEMORY_BASIC_INFORMATION64* info, size_t size)')
  }
  return api
}

export const memorySupported = process.platform === 'win32'

/** PIDs of running processes with this image name (e.g. dosbox.exe). */
export function findPids(image: string): Promise<number[]> {
  return new Promise((resolve) => {
    if (!memorySupported) return resolve([])
    execFile('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 5000 }, (err, out) => {
      if (err) return resolve([])
      const pids = [...out.matchAll(/^"[^"]+","(\d+)"/gm)].map((m) => Number(m[1]))
      resolve(pids)
    })
  })
}

export interface Region {
  base: bigint
  size: number
}

export class ProcessReader {
  private handle: unknown

  private constructor(handle: unknown, readonly pid: number) {
    this.handle = handle
  }

  static open(pid: number): ProcessReader | null {
    const h = load().OpenProcess(PROCESS_VM_READ | PROCESS_QUERY_INFORMATION, false, pid)
    return h ? new ProcessReader(h, pid) : null
  }

  /** Committed, private, read-write regions: where DOSBox allocates emulated RAM. */
  regions(minSize = 0x10000, maxSize = 0x10000000): Region[] {
    const out: Region[] = []
    const info: Record<string, bigint | number> = {}
    let addr = 0n
    const k = load()
    while (addr < 0x7fffffffffffn) {
      if (!k.VirtualQueryEx(this.handle, addr, info, koffi.sizeof(MBI))) break
      const base = BigInt(info.BaseAddress!)
      const size = Number(info.RegionSize)
      if (info.State === MEM_COMMIT && info.Type === MEM_PRIVATE && info.Protect === PAGE_READWRITE && size >= minSize && size <= maxSize) {
        out.push({ base, size })
      }
      const next = base + BigInt(size)
      if (next <= addr) break
      addr = next
    }
    return out
  }

  read(addr: bigint, size: number): Uint8Array | null {
    const buf = Buffer.alloc(size)
    const got: [number] = [0]
    return load().ReadProcessMemory(this.handle, addr, buf, size, got) && got[0] === size ? new Uint8Array(buf) : null
  }

  close(): void {
    if (this.handle) load().CloseHandle(this.handle)
    this.handle = null
  }
}
