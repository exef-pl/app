#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

function resolveBaseUrl() {
  if (process.env.EXEF_TEST_URL) {
    return process.env.EXEF_TEST_URL
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

async function testHealth() {
  console.log('\n[TEST] GET /health')
  const res = await fetch(`${BASE_URL}/health`)
  const json = await res.json()
  console.log('  Status:', res.status)
  console.log('  Response:', JSON.stringify(json))
  return res.ok
}

async function testInboxStats() {
  console.log('\n[TEST] GET /inbox/stats')
  const res = await fetch(`${BASE_URL}/inbox/stats`)
  const json = await res.json()
  console.log('  Status:', res.status)
  console.log('  Response:', JSON.stringify(json, null, 2))
  return res.ok
}

async function testDebugWorkflowEvents() {
  console.log('\n[TEST] GET /debug/workflow/events')
  const res = await fetch(`${BASE_URL}/debug/workflow/events`)
  const json = await res.json().catch(() => ({}))
  console.log('  Status:', res.status)
  console.log('  Events:', Array.isArray(json.events) ? json.events.length : 'n/a')
  return res.ok
}

async function testDebugStorageState() {
  console.log('\n[TEST] GET /debug/storage/state')
  const res = await fetch(`${BASE_URL}/debug/storage/state`)
  const json = await res.json().catch(() => ({}))
  console.log('  Status:', res.status)
  console.log('  State keys:', json?.state ? Object.keys(json.state) : 'n/a')
  return res.ok
}

async function testDebugStorageSync() {
  console.log('\n[TEST] POST /debug/storage/sync')
  const res = await fetch(`${BASE_URL}/debug/storage/sync`, { method: 'POST' })
  const json = await res.json().catch(() => ({}))
  console.log('  Status:', res.status)
  console.log('  Response:', JSON.stringify(json, null, 2))
  return res.ok
}

async function testSettingsEmailRoundTrip() {
  console.log('\n[TEST] PUT /settings (email round-trip)')

  const settingsRes = await fetch(`${BASE_URL}/settings`)
  const originalSettings = await settingsRes.json().catch(() => null)
  if (!settingsRes.ok || !originalSettings) {
    console.log('  Cannot read settings, skip')
    return false
  }

  const originalEmail = originalSettings?.channels?.email || null

  try {
    const body = {
      channels: {
        email: {
          activeAccountId: 'acc-1',
          accounts: [
            {
              id: 'acc-1',
              provider: 'imap',
              enabled: true,
              imap: {
                host: 'imap.example.com',
                port: 993,
                tls: true,
                user: 'test@example.com',
                password: 'secret',
                mailbox: 'INBOX',
              },
            },
          ],
        },
      },
    }

    const putRes = await fetch(`${BASE_URL}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const putJson = await putRes.json().catch(() => ({}))
    console.log('  Status:', putRes.status)
    if (!putRes.ok) {
      console.log('  Response:', JSON.stringify(putJson))
      return false
    }

    const next = putJson?.channels?.email
    const ok =
      next &&
      next.activeAccountId === 'acc-1' &&
      Array.isArray(next.accounts) &&
      next.accounts.length === 1 &&
      next.accounts[0].id === 'acc-1'

    return !!ok
  } finally {
    try {
      await fetch(`${BASE_URL}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channels: {
            email: originalEmail,
          },
        }),
      })
    } catch (_e) {
    }
  }
}

async function testLocalFolderStorageSyncImportAndProcess() {
  console.log('\n[TEST] Local folder sync -> invoice -> process (XML fixture)')

  const settingsRes = await fetch(`${BASE_URL}/settings`)
  const originalSettings = await settingsRes.json().catch(() => null)
  if (!settingsRes.ok || !originalSettings) {
    console.log('  Cannot read settings, skip')
    return false
  }

  const originalPaths = Array.isArray(originalSettings?.channels?.localFolders?.paths)
    ? originalSettings.channels.localFolders.paths
    : []

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exef-watch-'))
  const fixturePath = path.join(__dirname, 'fixtures', 'sample-invoice.xml')
  const xmlContent = fs.readFileSync(fixturePath, 'utf8')
  const watchedFileName = `watch-invoice-${Date.now()}.xml`
  const watchedFilePath = path.join(tmpDir, watchedFileName)
  fs.writeFileSync(watchedFilePath, xmlContent, 'utf8')

  try {
    const setRes = await fetch(`${BASE_URL}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channels: {
          localFolders: { paths: [tmpDir] },
        },
      }),
    })
    const setJson = await setRes.json().catch(() => ({}))
    console.log('  Settings update status:', setRes.status)
    if (!setRes.ok) {
      console.log('  Settings update error:', JSON.stringify(setJson))
      return false
    }

    const syncRes = await fetch(`${BASE_URL}/debug/storage/sync`, { method: 'POST' })
    const syncJson = await syncRes.json().catch(() => ({}))
    console.log('  Sync status:', syncRes.status)
    console.log('  Sync response:', JSON.stringify(syncJson, null, 2))
    if (!syncRes.ok) {
      return false
    }

    const syncRes2 = await fetch(`${BASE_URL}/debug/storage/sync`, { method: 'POST' })
    const syncJson2 = await syncRes2.json().catch(() => ({}))
    console.log('  Sync#2 status:', syncRes2.status)
    console.log('  Sync#2 response:', JSON.stringify(syncJson2, null, 2))
    if (!syncRes2.ok) {
      return false
    }

    const listRes = await fetch(`${BASE_URL}/inbox/invoices?source=storage`)
    const listJson = await listRes.json().catch(() => ({}))
    if (!listRes.ok) {
      console.log('  List status:', listRes.status)
      return false
    }

    const invoices = Array.isArray(listJson.invoices) ? listJson.invoices : []
    const matches = invoices.filter((inv) => inv && inv.fileName === watchedFileName)
    const found = matches[0] || null
    if (!found) {
      console.log('  Invoice not found in inbox after sync')
      return false
    }

    if (matches.length !== 1) {
      console.log(`  Expected 1 invoice for watched file, got ${matches.length}`)
      return false
    }

    const procRes = await fetch(`${BASE_URL}/inbox/invoices/${encodeURIComponent(found.id)}/process`, { method: 'POST' })
    const procJson = await procRes.json().catch(() => ({}))
    console.log('  Process status:', procRes.status)
    if (!procRes.ok) {
      console.log('  Process error:', JSON.stringify(procJson))
      return false
    }
    console.log('  Processed invoice status:', procJson.status)
    console.log('  Extracted invoiceNumber:', procJson.invoiceNumber || procJson?.extracted?.invoiceNumber || '(none)')

    return true
  } finally {
    try {
      await fetch(`${BASE_URL}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channels: {
            localFolders: { paths: originalPaths },
          },
        }),
      })
    } catch (_e) {
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch (_e) {
    }
  }
}

async function testAddInvoiceFromJson() {
  console.log('\n[TEST] POST /inbox/invoices (JSON fixture)')

  const fixturePath = path.join(__dirname, 'fixtures', 'sample-invoice.json')
  const invoiceData = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))

  const res = await fetch(`${BASE_URL}/inbox/invoices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'scanner',
      metadata: {
        fileName: 'sample-invoice.json',
        invoiceNumber: invoiceData.invoiceNumber,
        contractorNip: invoiceData.buyer.nip,
        contractorName: invoiceData.buyer.name,
        grossAmount: invoiceData.totals.grossAmount,
        issueDate: invoiceData.issueDate,
      },
    }),
  })

  const json = await res.json()
  console.log('  Status:', res.status)
  console.log('  Invoice ID:', json.id)
  return json.id
}

async function testAddInvoiceFromXml() {
  console.log('\n[TEST] POST /inbox/invoices (XML/KSeF fixture)')

  const fixturePath = path.join(__dirname, 'fixtures', 'sample-invoice.xml')
  const xmlContent = fs.readFileSync(fixturePath, 'utf8')

  const res = await fetch(`${BASE_URL}/inbox/invoices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'ksef',
      file: xmlContent,
      metadata: {
        fileName: 'sample-invoice.xml',
        fileType: 'application/xml',
        ksefId: '1234567890-20260122-ABCDEF123456-01',
      },
    }),
  })

  const json = await res.json()
  console.log('  Status:', res.status)
  console.log('  Invoice ID:', json.id)
  return json.id
}

async function testListInvoices() {
  console.log('\n[TEST] GET /inbox/invoices')
  const res = await fetch(`${BASE_URL}/inbox/invoices`)
  const json = await res.json()
  console.log('  Status:', res.status)
  console.log('  Count:', json.count)
  if (json.invoices && json.invoices.length > 0) {
    console.log('  First invoice:', json.invoices[0].id, '-', json.invoices[0].status)
  }
  return res.ok
}

async function testProcessInvoice(invoiceId) {
  if (!invoiceId) {
    console.log('\n[SKIP] POST /inbox/invoices/:id/process - no invoice ID')
    return false
  }

  console.log(`\n[TEST] POST /inbox/invoices/${invoiceId}/process`)
  const res = await fetch(`${BASE_URL}/inbox/invoices/${invoiceId}/process`, {
    method: 'POST',
  })
  const json = await res.json()
  console.log('  Status:', res.status)
  console.log('  Invoice status:', json.status)
  console.log('  Category suggestion:', json.suggestion?.category || 'none')
  return res.ok
}

async function testApproveInvoice(invoiceId) {
  if (!invoiceId) {
    console.log('\n[SKIP] POST /inbox/invoices/:id/approve - no invoice ID')
    return false
  }

  console.log(`\n[TEST] POST /inbox/invoices/${invoiceId}/approve`)
  const res = await fetch(`${BASE_URL}/inbox/invoices/${invoiceId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'hosting', mpk: 'IT-001' }),
  })
  const json = await res.json()
  console.log('  Status:', res.status)
  console.log('  Invoice status:', json.status)
  return res.ok
}

async function testExportCsv() {
  console.log('\n[TEST] POST /inbox/export (CSV)')
  const res = await fetch(`${BASE_URL}/inbox/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'csv' }),
  })
  const json = await res.json()
  console.log('  Status:', res.status)
  if (json.content) {
    const lines = json.content.split('\n').length
    console.log('  CSV lines:', lines)
  }
  return res.ok
}

async function testKsefEndpoints() {
  console.log('\n[TEST] POST /ksef/auth/token')
  const res = await fetch(`${BASE_URL}/ksef/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 'test-token-123', nip: '1234567890' }),
  })
  const json = await res.json()
  console.log('  Status:', res.status)
  console.log('  Access Token:', json.accessToken ? 'received' : 'none')
  return res.ok
}

async function runAllTests() {
  console.log('='.repeat(60))
  console.log('EXEF Inbox API Tests')
  console.log('Base URL:', BASE_URL)
  console.log('='.repeat(60))

  const results = []

  try {
    results.push({ name: 'health', ok: await testHealth() })
    results.push({ name: 'inbox/stats', ok: await testInboxStats() })

    results.push({ name: 'debug/workflow/events', ok: await testDebugWorkflowEvents() })
    results.push({ name: 'debug/storage/state', ok: await testDebugStorageState() })
    results.push({ name: 'debug/storage/sync', ok: await testDebugStorageSync() })
    results.push({ name: 'settings email round-trip', ok: await testSettingsEmailRoundTrip() })
    results.push({ name: 'storage local folder -> process (xml)', ok: await testLocalFolderStorageSyncImportAndProcess() })

    const jsonInvoiceId = await testAddInvoiceFromJson()
    results.push({ name: 'add invoice (JSON)', ok: !!jsonInvoiceId })

    const xmlInvoiceId = await testAddInvoiceFromXml()
    results.push({ name: 'add invoice (XML)', ok: !!xmlInvoiceId })

    results.push({ name: 'list invoices', ok: await testListInvoices() })

    results.push({ name: 'process invoice', ok: await testProcessInvoice(jsonInvoiceId) })
    results.push({ name: 'approve invoice', ok: await testApproveInvoice(jsonInvoiceId) })
    results.push({ name: 'export CSV', ok: await testExportCsv() })
    results.push({ name: 'ksef auth', ok: await testKsefEndpoints() })
  } catch (e) {
    console.error('\n[ERROR]', e.message)
  }

  console.log('\n' + '='.repeat(60))
  console.log('Test Results:')
  console.log('='.repeat(60))

  let passed = 0
  let failed = 0

  for (const r of results) {
    const status = r.ok ? '✓ PASS' : '✗ FAIL'
    console.log(`  ${status}  ${r.name}`)
    if (r.ok) passed++
    else failed++
  }

  console.log('\n' + '-'.repeat(60))
  console.log(`Total: ${passed} passed, ${failed} failed`)
  console.log('='.repeat(60))

  process.exit(failed > 0 ? 1 : 0)
}

runAllTests()
