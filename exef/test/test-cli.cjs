#!/usr/bin/env node

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function resolveBaseUrl() {
  if (process.env.EXEF_TEST_URL) {
    return process.env.EXEF_TEST_URL
  }
  if (process.env.EXEF_API_URL) {
    return process.env.EXEF_API_URL
  }

  try {
    const portFile = path.join(__dirname, '..', '.exef-local-service.port')
    if (fs.existsSync(portFile)) {
      const port = String(fs.readFileSync(portFile, 'utf8')).trim()
      if (port) {
        return `http://127.0.0.1:${port}`
      }
    }
  } catch (_e) {
  }

  return 'http://127.0.0.1:3030'
}

const BASE_URL = resolveBaseUrl()

function runCli(args) {
  const res = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'exef.cjs'), ...args], {
    env: {
      ...process.env,
      EXEF_API_URL: BASE_URL,
      EXEF_OUTPUT_FORMAT: 'json',
    },
    encoding: 'utf8',
  })

  return {
    code: res.status ?? 0,
    stdout: String(res.stdout || ''),
    stderr: String(res.stderr || ''),
  }
}

function parseJsonOutput(stdout) {
  const trimmed = String(stdout || '').trim()
  if (!trimmed) {
    return null
  }

  try {
    return JSON.parse(trimmed)
  } catch (_e) {
  }

  const firstObj = trimmed.indexOf('{')
  const lastObj = trimmed.lastIndexOf('}')
  if (firstObj >= 0 && lastObj > firstObj) {
    const candidate = trimmed.slice(firstObj, lastObj + 1)
    try {
      return JSON.parse(candidate)
    } catch (_e) {
    }
  }

  const firstArr = trimmed.indexOf('[')
  const lastArr = trimmed.lastIndexOf(']')
  if (firstArr >= 0 && lastArr > firstArr) {
    const candidate = trimmed.slice(firstArr, lastArr + 1)
    try {
      return JSON.parse(candidate)
    } catch (_e) {
    }
  }

  const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i])
    } catch (_e) {
    }
  }

  return null
}

function assert(condition, msg) {
  if (!condition) {
    throw new Error(msg)
  }
}

async function run() {
  console.log('='.repeat(60))
  console.log('EXEF CLI Tests')
  console.log('Base URL:', BASE_URL)
  console.log('='.repeat(60))

  const tests = []

  const health = runCli(['health', '--json'])
  tests.push({ name: 'exef health --json', ok: health.code === 0 && !!parseJsonOutput(health.stdout) })

  const status = runCli(['status', '--json'])
  const statusJson = parseJsonOutput(status.stdout)
  tests.push({ name: 'exef status --json', ok: status.code === 0 && !!statusJson })

  const inboxStats = runCli(['inbox', 'stats', '--json'])
  const inboxStatsJson = parseJsonOutput(inboxStats.stdout)
  tests.push({ name: 'exef inbox stats --json', ok: inboxStats.code === 0 && !!inboxStatsJson })

  const inboxList = runCli(['inbox', 'list', '--json'])
  const inboxListJson = parseJsonOutput(inboxList.stdout)
  tests.push({ name: 'exef inbox list --json', ok: inboxList.code === 0 && !!inboxListJson })

  const settingsGet = runCli(['settings', 'get', '--json'])
  const settingsJson = parseJsonOutput(settingsGet.stdout)
  tests.push({ name: 'exef settings get --json', ok: settingsGet.code === 0 && !!settingsJson })

  const ksefAuth = runCli(['ksef', 'auth', '--token', 'test-token-123', '--nip', '1234567890', '--json'])
  const ksefAuthJson = parseJsonOutput(ksefAuth.stdout)
  tests.push({
    name: 'exef ksef auth --json (and persisted)',
    ok: ksefAuth.code === 0 && !!ksefAuthJson?.accessToken && ksefAuthJson?.saved === true && !!ksefAuthJson?.accountId,
  })

  console.log('\n' + '='.repeat(60))
  console.log('Test Results:')
  console.log('='.repeat(60))

  let passed = 0
  let failed = 0
  for (const t of tests) {
    const statusText = t.ok ? '✓ PASS' : '✗ FAIL'
    console.log(`  ${statusText}  ${t.name}`)
    if (t.ok) passed++
    else failed++
  }

  console.log('\n' + '-'.repeat(60))
  console.log(`Total: ${passed} passed, ${failed} failed`)
  console.log('='.repeat(60))

  assert(failed === 0, 'CLI tests failed')
}

run().catch((e) => {
  console.error('[ERROR]', e?.stack || e?.message || String(e))
  process.exit(1)
})
