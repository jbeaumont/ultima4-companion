/** One virtue: karma bar (0-99) with the Avatar mark at 0; optional rune badge (Journal). */
export function VirtueRow({ name, karma, rune }: { name: string; karma: number; rune?: boolean }) {
  const width = `${Math.max(0, Math.min(100, (karma / 99) * 100))}%`
  return (
    <div className={`stat-row${rune === undefined ? '' : ' with-rune'}`}>
      <span>{name}</span>
      {rune !== undefined && <span className={`rune ${rune ? 'yes' : 'no'}`}>{rune ? 'Rune' : 'No rune'}</span>}
      <div className="bar">
        <div className={`fill ${karma === 0 ? '' : 'karma'}`} style={{ width }} />
      </div>
      {karma === 0 ? <span className="avatar" title="Partial Avatarhood">☥ Avatar</span> : <span>{karma}</span>}
    </div>
  )
}
