// Combines the save-file watcher (always on) with the live memory reader
// (optional). Live memory wins while attached; otherwise the latest save is shown.
import type { GameState, StateSource } from '@shared/types'
import { MemorySource } from './memory/memorySource'
import { SaveFileSource } from './saveFileSource'

export class HybridSource implements StateSource {
  private file: SaveFileSource
  private memory: MemorySource | null
  private fileState: GameState | null = null
  private memState: GameState | null = null
  private onState: (s: GameState) => void = () => {}

  constructor(gameDir: string | null, liveMemory: boolean) {
    this.file = new SaveFileSource(gameDir)
    this.memory = liveMemory
      ? new MemorySource(
          () => (this.fileState?.party ? this.fileState.party.allRecords.slice(0, this.fileState.party.memberCount || 1).map((r) => r.name) : []),
          () => ({ gameDir, savePath: this.fileState?.savePath ?? null })
        )
      : null
  }

  start(onState: (state: GameState) => void): void {
    this.onState = onState
    this.file.start((s) => {
      this.fileState = s
      if (!this.memState) onState(s)
    })
    this.memory?.start((s) => {
      this.memState = s
      const current = s ?? this.fileState
      if (current) onState(current)
    })
  }

  async stop(): Promise<void> {
    await Promise.all([this.file.stop(), this.memory?.stop()])
  }

  getState(): GameState | null {
    return this.memState ?? this.fileState
  }

  attachment() {
    return this.memory?.attachment() ?? null
  }
}
