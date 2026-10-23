// Combines the save-file watcher (always on) with the live memory reader
// (optional). Live memory wins while attached; otherwise the latest save is shown.
import type { GameState, StateSource } from '@shared/types'
import { unsavedMoves } from '@domain/unsaved'
import { MemorySource } from './memory/memorySource'
import { isTestDosbox } from './memory/win32'
import { TEST_MODE } from './mode'
import { SaveFileSource } from './saveFileSource'

export class HybridSource implements StateSource {
  private file: SaveFileSource
  private memory: MemorySource | null
  private fileState: GameState | null = null
  private memState: GameState | null = null
  private onState: (s: GameState) => void = () => {}
  /** Whether live memory was ever attached: a later save-file state is then a fallback, not the normal view. */
  private wasLive = false

  /** @param onFile called with every save-file state, even while live memory is shown (used for snapshots) */
  constructor(gameDir: string | null, liveMemory: boolean, private readonly onFile?: (s: GameState) => void, overlayDir?: string) {
    this.file = new SaveFileSource(gameDir, overlayDir)
    this.memory = liveMemory
      ? new MemorySource(
          () => (this.fileState?.party ? this.fileState.party.allRecords.slice(0, this.fileState.party.memberCount || 1).map((r) => r.name) : []),
          () => ({ gameDir, savePath: this.fileState?.savePath ?? null }),
          // a test instance reads only test games; a normal one never does
          (cmd) => isTestDosbox(cmd) === TEST_MODE
        )
      : null
  }

  start(onState: (state: GameState) => void): void {
    this.onState = onState
    this.file.start((s) => {
      this.fileState = s
      this.onFile?.(s)
      if (!this.memState) return onState(this.fromFile()!) // fileState was just set
      // a new save changes how much live progress is unsaved
      this.memState = { ...this.memState, unsavedMoves: unsavedMoves(this.memState.party, s.party) }
      onState(this.memState)
    })
    this.memory?.start((s) => {
      if (s) this.wasLive = true
      this.memState = s ? { ...s, unsavedMoves: unsavedMoves(s.party, this.fileState?.party ?? null) } : null
      const current = this.memState ?? this.fromFile()
      if (current) onState(current)
    })
  }

  async stop(): Promise<void> {
    await Promise.all([this.file.stop(), this.memory?.stop()])
  }

  getState(): GameState | null {
    return this.memState ?? this.fromFile()
  }

  /** The save-file state, marked as a fallback once live memory has gone away. */
  private fromFile(): GameState | null {
    if (!this.fileState) return null
    const observation = {
      session: 'save',
      sequence: 0,
      observedAt: this.fileState.updatedAt ?? Date.now(),
      status: this.wasLive ? ('detached' as const) : ('saveFile' as const)
    }
    return { ...this.fileState, observation }
  }

  attachment() {
    return this.memory?.attachment() ?? null
  }
}
