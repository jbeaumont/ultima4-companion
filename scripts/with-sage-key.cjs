// Run a script with the Sage API key the companion stored in Settings (encrypted
// with Electron safeStorage, so only Electron can read it). The key goes to the
// child's environment only; it is never printed or written.
//   npx electron scripts/with-sage-key.cjs [--test] -- <script.ts> [args...]
const { app, safeStorage } = require('electron')
const { spawn } = require('node:child_process')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const argv = process.argv.slice(2)
const sep = argv.indexOf('--')
const test = argv.slice(0, sep < 0 ? argv.length : sep).includes('--test')
const rest = sep < 0 ? [] : argv.slice(sep + 1)
app.setPath('userData', join(app.getPath('appData'), test ? 'ultima4-companion-test' : 'ultima4-companion'))

app.whenReady().then(() => {
  let key
  try {
    key = safeStorage.decryptString(readFileSync(join(app.getPath('userData'), 'sage-key.bin')))
  } catch (err) {
    console.error(`No readable Sage key in ${app.getPath('userData')}: ${err.message}`)
    app.exit(1)
    return
  }
  const child = spawn('npx', ['tsx', ...rest], { stdio: 'inherit', shell: true, env: { ...process.env, ANTHROPIC_API_KEY: key } })
  child.on('exit', (code) => app.exit(code ?? 1))
})
