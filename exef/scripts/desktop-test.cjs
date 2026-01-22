#!/usr/bin/env node

const { spawn, exec } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const { promisify } = require('node:util')

const execAsync = promisify(exec)

function isPortFree(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, host)
  })
}

async function findAppImage() {
  const dir = path.join(__dirname, '..', 'dist', 'desktop')
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.AppImage'))
  if (files.length === 0) {
    throw new Error('No AppImage found in dist/desktop. Run: make exef-desktop-build')
  }
  // Prefer the latest version by filename order
  const latest = files.sort().reverse()[0]
  return path.join(dir, latest)
}

async function runLocalService() {
  const bin = path.join(__dirname, '..', 'dist', 'exef-local-service')
  if (!fs.existsSync(bin)) {
    throw new Error('Local service binary not found. Run: make exef-local-build')
  }
  const child = spawn(bin, [], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  child.unref()
  // Wait for the service to write its port file
  const portFile = path.join(__dirname, '..', '.exef-local-service.port')
  for (let i = 0; i < 30; i += 1) {
    await new Promise(r => setTimeout(r, 500))
    if (fs.existsSync(portFile)) {
      const port = Number(fs.readFileSync(portFile, 'utf8').trim())
      if (Number.isInteger(port) && port > 0) {
        console.log(`[desktop-test] local-service started on port ${port}`)
        return { port, child }
      }
    }
  }
  throw new Error('local-service did not write port file in time')
}

async function waitForHealth(baseUrl, retries = 10) {
  for (let i = 0; i < retries; i += 1) {
    try {
      const res = await fetch(`${baseUrl}/health`)
      if (res.ok) {
        const json = await res.json()
        console.log(`[desktop-test] health OK: ${json.service}`)
        return true
      }
    } catch {}
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error('health endpoint not responding')
}

async function launchAppImage(appImagePath) {
  const child = spawn(appImagePath, [], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  child.unref()
  console.log(`[desktop-test] launched AppImage: ${appImagePath}`)
}

async function cleanup(localServicePid) {
  if (localServicePid) {
    try {
      process.kill(localServicePid, 'SIGTERM')
    } catch {}
  }
  // Remove port file
  const portFile = path.join(__dirname, '..', '.exef-local-service.port')
  try {
    fs.unlinkSync(portFile)
  } catch {}
}

async function main() {
  console.log('[desktop-test] Starting smoke-test for ExEF Desktop on Linux...')
  try {
    // 1) Find AppImage
    const appImage = await findAppImage()
    // 2) Start local-service
    const { port, child } = await runLocalService()
    // 3) Verify health
    await waitForHealth(`http://127.0.0.1:${port}`)
    // 4) Launch AppImage
    await launchAppImage(appImage)
    console.log('[desktop-test] Smoke-test passed. Desktop app should be open.')
    console.log('[desktop-test] Verify in the UI: click "Sprawdź połączenie" to confirm connection to local-service.')
    // Keep alive for a few seconds to let the app initialize
    await new Promise(r => setTimeout(r, 3000))
    // Cleanup
    cleanup(child.pid)
  } catch (e) {
    console.error('[desktop-test] ERROR:', e.message)
    process.exit(1)
  }
}

main()
