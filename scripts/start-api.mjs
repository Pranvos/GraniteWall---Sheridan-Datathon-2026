#!/usr/bin/env node
/**
 * Start FastAPI (uvicorn) for local demo.
 * If :8000 is already taken, keep this process alive so `concurrently` stays up.
 */
import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const BACKEND = path.join(ROOT, 'backend')
const PORT = Number(process.env.API_PORT || 8000)
const HOST = process.env.API_HOST || '127.0.0.1'

function venvPython() {
  const unix = path.join(ROOT, '.venv', 'bin', 'python')
  const win = path.join(ROOT, '.venv', 'Scripts', 'python.exe')
  if (fs.existsSync(unix)) return unix
  if (fs.existsSync(win)) return win
  return null
}

function portInUse(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host }, () => {
      socket.end()
      resolve(true)
    })
    socket.on('error', () => resolve(false))
  })
}

function holdOpen(message) {
  console.log(message)
  setInterval(() => {}, 1 << 30)
}

async function main() {
  if (await portInUse(PORT, HOST)) {
    holdOpen(`[api] already running at http://${HOST}:${PORT} — reusing it`)
    return
  }

  const python = venvPython()
  if (!python) {
    console.error('[api] missing .venv — run: python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt')
    process.exit(1)
  }

  console.log(`[api] starting uvicorn on http://${HOST}:${PORT}`)
  const child = spawn(
    python,
    ['-m', 'uvicorn', 'main:app', '--reload', '--host', HOST, '--port', String(PORT)],
    {
      cwd: BACKEND,
      stdio: 'inherit',
      env: process.env,
    },
  )

  const shutdown = (signal) => {
    if (!child.killed) child.kill(signal)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal)
    process.exit(code ?? 1)
  })
}

main().catch((error) => {
  console.error('[api]', error)
  process.exit(1)
})
