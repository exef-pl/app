#!/usr/bin/env node

const { spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitFor(condFn, { timeoutMs = 20000, intervalMs = 250 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const ok = await condFn()
      if (ok) return true
    } catch (_e) {
    }
    await sleep(intervalMs)
  }
  return false
}

async function fetchJson(url) {
  const res = await fetch(url)
  const json = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, json }
}

function readPortFile(portFilePath) {
  try {
    if (!fs.existsSync(portFilePath)) return null
    const port = String(fs.readFileSync(portFilePath, 'utf8')).trim()
    return port ? Number(port) : null
  } catch (_e) {
    return null
  }
}

async function runNodeScript(cwd, scriptRelPath, env) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [scriptRelPath], {
      cwd,
      env,
      stdio: 'inherit',
    })
    p.on('exit', (code) => resolve(code ?? 0))
  })
}

async function main() {
  const exefDir = path.join(__dirname, '..')
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'exef-e2e-'))
  const portFilePath = path.join(tmpRoot, 'port.txt')

  const settingsPath = path.join(tmpRoot, 'settings.json')
  const invoiceStorePath = path.join(tmpRoot, 'invoices.json')
  const projectsPath = path.join(tmpRoot, 'projects.csv')
  const labelsPath = path.join(tmpRoot, 'labels.csv')
  const expenseTypesPath = path.join(tmpRoot, 'expense_types.csv')
  const sqliteDbPath = path.join(tmpRoot, 'exef.sqlite')

  const env = {
    ...process.env,
    EXEF_LOCAL_SERVICE_HOST: '127.0.0.1',
    EXEF_LOCAL_SERVICE_PORT: '0',
    EXEF_LOCAL_SERVICE_PORT_FILE: portFilePath,
    EXEF_LOCAL_SERVICE_PORT_MAX_TRIES: '50',
    EXEF_SETTINGS_FILE_PATH: settingsPath,
    EXEF_INVOICE_STORE_PATH: invoiceStorePath,
    EXEF_PROJECTS_FILE_PATH: projectsPath,
    EXEF_LABELS_FILE_PATH: labelsPath,
    EXEF_EXPENSE_TYPES_FILE_PATH: expenseTypesPath,
    EXEF_STORAGE_BACKEND: 'sqlite',
    EXEF_DB_PATH: sqliteDbPath,
  }

  console.log('='.repeat(60))
  console.log('EXEF E2E (local-service + API + CLI)')
  console.log('TMP:', tmpRoot)
  console.log('='.repeat(60))

  const server = spawn(process.execPath, ['src/local-service/server.js'], {
    cwd: exefDir,
    env,
    stdio: 'inherit',
  })

  let baseUrl = null

  try {
    const portReady = await waitFor(() => !!readPortFile(portFilePath), { timeoutMs: 20000 })
    if (!portReady) {
      throw new Error('Port file not created by local-service')
    }

    const port = readPortFile(portFilePath)
    if (!port) {
      throw new Error('Invalid port in port file')
    }

    baseUrl = `http://127.0.0.1:${port}`

    const ok = await waitFor(async () => {
      const res = await fetchJson(`${baseUrl}/health`)
      return res.ok && res.json && res.json.status === 'ok'
    }, { timeoutMs: 20000 })

    if (!ok) {
      throw new Error('local-service health check failed')
    }

    const testEnv = {
      ...env,
      EXEF_TEST_URL: baseUrl,
      EXEF_API_URL: baseUrl,
    }

    const apiCode = await runNodeScript(exefDir, 'test/test-inbox.cjs', testEnv)
    if (apiCode !== 0) {
      throw new Error(`API tests failed with code ${apiCode}`)
    }

    const cliCode = await runNodeScript(exefDir, 'test/test-cli.cjs', testEnv)
    if (cliCode !== 0) {
      throw new Error(`CLI tests failed with code ${cliCode}`)
    }

    console.log('\nE2E OK')
  } finally {
    try {
      if (server && !server.killed) {
        server.kill('SIGINT')
      }
    } catch (_e) {
    }

    const exited = await waitFor(() => server.killed || server.exitCode != null, { timeoutMs: 5000, intervalMs: 100 })
    if (!exited) {
      try {
        server.kill('SIGKILL')
      } catch (_e) {
      }
    }

    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true })
    } catch (_e) {
    }
  }
}

main().catch((e) => {
  console.error('[E2E ERROR]', e?.stack || e?.message || String(e))
  process.exit(1)
})
