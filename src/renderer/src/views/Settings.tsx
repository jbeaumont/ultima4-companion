import { useEffect, useState } from 'react'
import { Playthroughs } from '../components/Playthroughs'
import type { GameState, SettingsInfo } from '@shared/types'
import type { SageStatus } from '../../../main/sage/sageIpc'

interface Props {
  state: GameState | null
  onState: (s: GameState | null) => void
}

export function Settings({ state, onState }: Props) {
  const [info, setInfo] = useState<SettingsInfo | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    window.u4.getSettings().then(setInfo)
  }, [state?.gameDir, state?.savePath])

  // attachment changes as DOSBox starts and stops, so poll while the view is open
  useEffect(() => {
    const t = setInterval(() => window.u4.getSettings().then(setInfo, () => undefined), 2000)
    return () => clearInterval(t)
  }, [])

  const choose = async () => {
    const s = await window.u4.chooseGameDir()
    if (s) onState(s)
  }

  const toggleLive = async (on: boolean) => {
    setBusy(true)
    try {
      const s = await window.u4.setLiveMemory(on)
      if (s) onState(s)
      setInfo(await window.u4.getSettings())
    } finally {
      setBusy(false)
    }
  }

  const toggleEditor = async (on: boolean) => {
    setBusy(true)
    try {
      await window.u4.setEditorEnabled(on)
      setInfo(await window.u4.getSettings())
    } finally {
      setBusy(false)
    }
  }

  const toggleSage = async (on: boolean) => {
    setBusy(true)
    try {
      await window.u4.setSageEnabled(on)
      setInfo(await window.u4.getSettings())
      window.dispatchEvent(new Event('u4-settings-changed'))
    } finally {
      setBusy(false)
      refreshSage()
    }
  }

  const [sage, setSage] = useState<SageStatus | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [keyError, setKeyError] = useState<string | null>(null)
  const refreshSage = (): void => {
    window.u4.sageStatus().then(setSage, () => undefined)
  }
  useEffect(refreshSage, [])

  const saveKey = async () => {
    const k = keyInput
    setKeyInput('') // the key lives in this input only until it is sent
    setKeyError(null)
    setBusy(true)
    try {
      await window.u4.sageSetKey(k)
    } catch (err) {
      setKeyError(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']*': (Error: )?/, '') : 'Could not save the key')
    } finally {
      setBusy(false)
      refreshSage()
    }
  }

  const removeKey = async () => {
    setBusy(true)
    try {
      await window.u4.sageClearKey()
    } finally {
      setBusy(false)
      refreshSage()
    }
  }

  const [seedMsg, setSeedMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const seed = async (from: 'real' | 'empty'): Promise<void> => {
    const what = from === 'real'
      ? 'Replace the test saves with a copy of your real save?'
      : 'Replace the test saves with an empty save folder (a new game)?'
    if (!window.confirm(`${what} Your real game is not touched.`)) return
    setBusy(true)
    setSeedMsg(null)
    try {
      const r = await window.u4.seedTestSaves(from)
      setSeedMsg(r.ok ? { ok: true, text: from === 'real' ? 'Test saves reset from your real save.' : 'Test saves reset to an empty folder.' } : { ok: false, text: r.message })
    } catch {
      setSeedMsg({ ok: false, text: 'Could not reset the test saves.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h2>Settings</h2>
      {info?.testMode && (
        <section className="panel settings">
          <h3>Test saves</h3>
          <p className="muted small">
            This is a test instance. Its saves are separate from the real game, and so are its journal, fog of war and snapshots.
          </p>
          <div className="key-row">
            <button className="btn" disabled={busy} onClick={() => void seed('real')}>Reset test saves from my real save</button>
            <button className="btn" disabled={busy} onClick={() => void seed('empty')}>Reset to an empty save folder (new game)</button>
          </div>
          {seedMsg && <p className={`result ${seedMsg.ok ? 'ok' : 'error'}`}>{seedMsg.text}</p>}
        </section>
      )}
      {info && !info.testMode && (
        <p className="muted small">
          Play Ultima IV launches the game windowed beside the companion with your normal saves (no changes to the game folder).
        </p>
      )}
      <Playthroughs />
      <section className="panel settings">
        <dl>
          <dt>Game folder</dt>
          <dd>{info?.gameDir ?? <span className="muted">not found</span>}</dd>
          <dt>Save file</dt>
          <dd>{info?.savePath ?? <span className="muted">none</span>}</dd>
          <dt>Manual override</dt>
          <dd>{info?.override ?? <span className="muted">none (auto-detected)</span>}</dd>
        </dl>
        <button className="btn" onClick={choose}>Choose folder…</button>
        <p className="muted small">Read-only: the companion never writes to the game folder.</p>
      </section>
      <section className="panel settings">
        <h3>Live memory mode</h3>
        <label className="check">
          <input
            type="checkbox" checked={info?.liveMemory ?? false} disabled={!info || busy}
            onChange={(e) => toggleLive(e.target.checked)}
          /> Read the game live from DOSBox
        </label>
        <p className="muted small">
          Reads DOSBox's memory read-only, so the Tracker and maps update as you play instead of on save.
          It only works while the game is running; otherwise the companion falls back to the save file.
        </p>
        {info?.liveMemory && (
          <p className={info.attachedPid !== null ? 'ok' : 'muted'}>
            {info.attachedPid !== null ? `Attached to DOSBox (PID ${info.attachedPid})` : 'Not attached'}
          </p>
        )}
      </section>
      <section className="panel settings">
        <h3>Save editor</h3>
        <label className="check">
          <input
            type="checkbox" checked={info?.editorEnabled ?? false} disabled={!info || busy}
            onChange={(e) => toggleEditor(e.target.checked)}
          /> Enable save editor
        </label>
        <p className="note">
          This lets the Editor change your real save. A backup is always taken first, and DOSBox must be closed.
        </p>
      </section>
      <section className="panel settings">
        <h3>AI sage (optional)</h3>
        <label className="check">
          <input
            type="checkbox" checked={info?.sageEnabled ?? false} disabled={!info || busy}
            onChange={(e) => toggleSage(e.target.checked)}
          /> Enable the AI sage
        </label>
        <p className="muted small">
          An in-character advisor powered by Claude. It needs your own Anthropic API key and each question is billed to it.
          While this is off, the Sage is hidden and nothing is sent anywhere.
        </p>
        {info?.sageEnabled && (<>
        <p className={sage && (sage.hasStoredKey || sage.envKey) ? 'ok' : 'muted'}>
          {!sage
            ? 'Checking…'
            : sage.hasStoredKey
              ? 'Using a key saved in this app (encrypted with Windows secure storage)'
              : sage.envKey
                ? 'Using ANTHROPIC_API_KEY from the environment'
                : 'No key found: add one below, set ANTHROPIC_API_KEY, or run `ant auth login`'}
        </p>
        <div className="key-row">
          <input
            type="password" value={keyInput} placeholder="Anthropic API key" autoComplete="off" spellCheck={false}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && keyInput.trim() && !busy) void saveKey() }}
          />
          <button className="btn" disabled={busy || !keyInput.trim()} onClick={saveKey}>Save</button>
          {sage?.hasStoredKey && <button className="btn" disabled={busy} onClick={removeKey}>Remove saved key</button>}
        </div>
        {keyError && <p className="result error">{keyError}</p>}
        <p className="muted small">Your key never leaves this computer except in requests to Anthropic.</p>
        </>)}
      </section>
    </>
  )
}
