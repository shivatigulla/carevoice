// Shared helpers for the cross-platform dev scripts (Windows / macOS / Linux).
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const IS_WIN = process.platform === 'win32'

/** Absolute path to the python executable inside `<service>/.venv`. */
export function venvPython(service) {
  const venv = path.join(ROOT, service, '.venv')
  return IS_WIN ? path.join(venv, 'Scripts', 'python.exe') : path.join(venv, 'bin', 'python')
}

export function hasVenv(service) {
  return existsSync(venvPython(service))
}
