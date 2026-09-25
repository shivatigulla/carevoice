// One-time setup: create Python 3.11 virtualenvs for backend + voice, install their
// requirements, and install frontend npm packages.
//   npm run setup            (everything)
//   npm run setup -- backend (just one service)
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { IS_WIN, ROOT, hasVenv, venvPython } from './lib.mjs'

const only = process.argv[2]
const PY_SERVICES = ['backend', 'voice']

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: IS_WIN && cmd === 'npm', ...opts })
  if (r.status !== 0) {
    console.error(`\nCommand failed: ${cmd} ${args.join(' ')}`)
    process.exit(r.status ?? 1)
  }
}

/** Find a Python 3.11 interpreter: `py -3.11` on Windows, `python3.11` elsewhere. */
function findPython311() {
  const candidates = IS_WIN
    ? [['py', ['-3.11']], ['python3.11', []], ['python', []]]
    : [['python3.11', []], ['python3', []], ['python', []]]
  for (const [cmd, pre] of candidates) {
    const r = spawnSync(cmd, [...pre, '-c', 'import sys; print("%d.%d" % sys.version_info[:2])'], {
      encoding: 'utf8',
    })
    if (r.status === 0 && r.stdout.trim() === '3.11') return [cmd, pre]
  }
  console.error('Python 3.11 not found. Install it from https://www.python.org/downloads/ and re-run.')
  process.exit(1)
}

function setupPython(service) {
  const dir = path.join(ROOT, service)
  if (!hasVenv(service)) {
    const [cmd, pre] = findPython311()
    run(cmd, [...pre, '-m', 'venv', '.venv'], { cwd: dir })
  }
  run(venvPython(service), ['-m', 'pip', 'install', '--upgrade', 'pip'], { cwd: dir })
  run(venvPython(service), ['-m', 'pip', 'install', '-r', 'requirements.txt'], { cwd: dir })
  if (existsSync(path.join(dir, 'requirements-dev.txt'))) {
    run(venvPython(service), ['-m', 'pip', 'install', '-r', 'requirements-dev.txt'], { cwd: dir })
  }
}

function ensureEnv(dir) {
  const example = path.join(ROOT, dir, '.env.example')
  const env = path.join(ROOT, dir, '.env')
  if (existsSync(example) && !existsSync(env)) {
    copyFileSync(example, env)
    console.log(`Created ${dir}/.env from .env.example — fill in your keys.`)
  }
}

for (const s of PY_SERVICES) {
  if (!only || only === s) {
    setupPython(s)
    ensureEnv(s)
  }
}
if (!only || only === 'frontend') {
  run('npm', ['install'], { cwd: path.join(ROOT, 'frontend') })
  ensureEnv('frontend')
}
console.log('\nSetup complete. Next: fill in the .env files, then `npm run dev`.')
