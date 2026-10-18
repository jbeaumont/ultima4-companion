// Start a test instance of the companion (see CLAUDE.md, Play-testing).
// An environment variable is used because electron-vite does not reliably
// forward extra CLI arguments to Electron.
import { spawn } from 'node:child_process'

const child = spawn('npx', ['electron-vite', 'dev', '--remoteDebuggingPort', '9241'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, U4C_TEST: '1' }
})
child.on('exit', (code) => process.exit(code ?? 0))
