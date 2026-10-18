// Drive a running companion over the Chrome DevTools Protocol (dev tooling).
// Start the app with a debugging port first:
//   npm run dev:test            (test instance on port 9241)
//   npx electron-vite dev --remoteDebuggingPort 9229   (normal instance)
//
// Usage:
//   node scripts/cdp.mjs <port> state                 compact JSON of state, journal, snapshots
//   node scripts/cdp.mjs <port> eval "<js expr>"      evaluate in the renderer (await allowed via async IIFE)
//   node scripts/cdp.mjs <port> view <Name>           click a sidebar view (Tracker, Map, Journal, ...)
//   node scripts/cdp.mjs <port> shot <out.png> [js]   optionally run js, then screenshot the main window
//   node scripts/cdp.mjs <port> hud <out.png>         screenshot the pop-out HUD window
const [port = '9241', cmd = 'state', ...rest] = process.argv.slice(2)

async function target(wantHud) {
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      const t = list.find((p) => p.type === 'page' && /^(http|file)/.test(p.url) && p.url.includes('#hud') === wantHud)
      if (t) return t
    } catch {
      // app not up yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`no ${wantHud ? 'HUD' : 'main'} window on port ${port}`)
}

async function session(wantHud = false) {
  const t = await target(wantHud)
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise((r, j) => {
    ws.addEventListener('open', r)
    ws.addEventListener('error', j)
  })
  let id = 0
  const call = (method, params = {}) =>
    new Promise((resolve) => {
      const my = ++id
      const onMsg = (m) => {
        const msg = JSON.parse(m.data)
        if (msg.id !== my) return
        ws.removeEventListener('message', onMsg)
        resolve(msg.result)
      }
      ws.addEventListener('message', onMsg)
      ws.send(JSON.stringify({ id: my, method, params }))
    })
  const evaluate = async (expression) => {
    const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r?.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r?.result?.value
  }
  return { call, evaluate, close: () => ws.close() }
}

const STATE = `(async () => {
  const s = await window.u4.getState(), set = await window.u4.getSettings(), j = await window.u4.getJournal()
  const p = s && s.party
  return {
    testMode: set.testMode, source: s && s.source, status: s && s.status, attachedPid: set.attachedPid,
    savePath: set.savePath, unsavedMoves: s && s.unsavedMoves,
    location: p && p.location, x: p && p.x, y: p && p.y, dungeonLevel: p && p.dungeonLevel, out: p && [p.outX, p.outY],
    moves: p && p.moves, gold: p && p.gold, runes: p && p.runes, stones: p && p.stones, karma: p && p.karma,
    members: p && p.members.map((m) => m.name + ' ' + m.hp + '/' + m.hpMax + ' ' + m.status),
    visited: j.visited, spoilerLevel: j.spoilerLevel,
    snapshots: (await window.u4.listSnapshots()).slice(0, 5).map((m) => m.reason + '@' + (m.summary && m.summary.moves))
  }
})()`

const s = await session(cmd === 'hud')
try {
  if (cmd === 'state') console.log(JSON.stringify(await s.evaluate(STATE), null, 1))
  else if (cmd === 'eval') console.log(JSON.stringify(await s.evaluate(rest[0]), null, 1))
  else if (cmd === 'view') {
    const name = JSON.stringify(rest[0])
    console.log(await s.evaluate(`(() => { const b = [...document.querySelectorAll('.sidebar button')].find((b) => b.textContent === ${name}); if (b) b.click(); return !!b })()`))
  } else if (cmd === 'shot' || cmd === 'hud') {
    const [out, js] = rest
    if (js) console.log('eval:', JSON.stringify(await s.evaluate(js)))
    await new Promise((r) => setTimeout(r, 800))
    const { data } = await s.call('Page.captureScreenshot', { format: 'png' })
    const { writeFileSync } = await import('node:fs')
    writeFileSync(out, Buffer.from(data, 'base64'))
    console.log('saved', out)
  } else throw new Error(`unknown command ${cmd}`)
} finally {
  s.close()
}
