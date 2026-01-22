#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

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
