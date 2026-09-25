// Run a command with a service's virtualenv python, from inside that service's folder.
//   node scripts/py.mjs <backend|voice> <python args...>
// e.g. node scripts/py.mjs backend -m uvicorn app.main:app --reload
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { IS_WIN, ROOT, hasVenv, venvPython } from './lib.mjs'

const [service, ...args] = process.argv.slice(2)
if (!service || args.length === 0) {
  console.error('usage: node scripts/py.mjs <backend|voice> <python args...>')
  process.exit(2)
}
if (!hasVenv(service)) {
  console.error(`[${service}] virtualenv not found. Run \`npm run setup\` first.`)
  process.exit(1)
}

const child = spawn(venvPython(service), args, {
  cwd: path.join(ROOT, service),
  stdio: 'inherit',
  env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONUTF8: '1' },
})

// On Windows a venv's python.exe is a launcher that starts the real interpreter as a child, and
// uvicorn --reload adds more children. Kill the whole tree so nothing is left holding a port.
function stop(sig) {
  if (IS_WIN) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill(sig)
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => stop(sig))
process.on('exit', () => {
  if (child.exitCode === null) stop('SIGTERM')
})
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
