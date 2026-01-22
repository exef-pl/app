const fetch = require('node-fetch')
const fs = require('fs')
const path = require('path')

const SCANNER_1_URL = process.env.SCANNER_1_URL || 'http://localhost:8101'
const SCANNER_2_URL = process.env.SCANNER_2_URL || 'http://localhost:8102'
const PRINTER_1_URL = process.env.PRINTER_1_URL || 'http://localhost:8111'
const PRINTER_2_URL = process.env.PRINTER_2_URL || 'http://localhost:8112'

const results = {
  tests: [],
  passed: 0,
  failed: 0,
  timestamp: new Date().toISOString(),
}

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

async function test(name, fn) {
  try {
    await fn()
    results.tests.push({ name, status: 'passed' })
    results.passed++
    log(`✓ ${name}`)
  } catch (err) {
    results.tests.push({ name, status: 'failed', error: err.message })
    results.failed++
    log(`✗ ${name}: ${err.message}`)
  }
}

async function testScannerHealth(url, name) {
  const res = await fetch(`${url}/health`)
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`)
  const data = await res.json()
  if (data.device !== 'scanner') throw new Error('Not a scanner device')
  if (!data.name.includes(name)) throw new Error(`Unexpected scanner name: ${data.name}`)
  return data
}

async function testScannerCapabilities(url) {
  const res = await fetch(`${url}/eSCL/ScannerCapabilities`)
  if (!res.ok) throw new Error(`Capabilities failed: ${res.status}`)
  const xml = await res.text()
  if (!xml.includes('ScannerCapabilities')) throw new Error('Invalid capabilities XML')
  return xml
}

async function testScannerScan(url) {
  const res = await fetch(`${url}/api/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'pdf', resolution: 300 }),
  })
  if (!res.ok) throw new Error(`Scan failed: ${res.status}`)
  const data = await res.json()
  if (!data.id) throw new Error('No scan job ID')
  if (!data.content) throw new Error('No scan content')
  return data
}

async function testScannerDocuments(url) {
  const res = await fetch(`${url}/api/documents`)
  if (!res.ok) throw new Error(`Documents list failed: ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data.documents)) throw new Error('Invalid documents response')
  return data
}

async function testPrinterHealth(url, name) {
  const res = await fetch(`${url}/health`)
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`)
  const data = await res.json()
  if (data.device !== 'printer') throw new Error('Not a printer device')
  if (!data.name.includes(name)) throw new Error(`Unexpected printer name: ${data.name}`)
  return data
}

async function testPrinterInfo(url) {
  const res = await fetch(`${url}/api/printer`)
  if (!res.ok) throw new Error(`Printer info failed: ${res.status}`)
  const data = await res.json()
  if (!data.capabilities) throw new Error('No capabilities info')
  return data
}

async function testPrinterPrint(url) {
  const testDoc = {
    fileName: 'test-document.pdf',
    fileType: 'application/pdf',
    content: Buffer.from('%PDF-1.4\ntest content').toString('base64'),
  }
  
  const res = await fetch(`${url}/api/print`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document: testDoc, copies: 1 }),
  })
  if (!res.ok) throw new Error(`Print failed: ${res.status}`)
  const data = await res.json()
  if (!data.jobId) throw new Error('No job ID returned')
  return data
}

async function testPrinterJobs(url) {
  const res = await fetch(`${url}/api/jobs`)
  if (!res.ok) throw new Error(`Jobs list failed: ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data.jobs)) throw new Error('Invalid jobs response')
  return data
}

async function testPrinterJobStatus(url, jobId) {
  await new Promise(r => setTimeout(r, 2000))
  
  const res = await fetch(`${url}/api/jobs/${jobId}`)
  if (!res.ok) throw new Error(`Job status failed: ${res.status}`)
  const data = await res.json()
  if (data.state !== 'completed') throw new Error(`Job not completed: ${data.state}`)
  return data
}

async function runTests() {
  log('Starting device sync tests...')
  log('')

  log('=== Scanner 1 Tests ===')
  await test('Scanner 1 - Health check', () => testScannerHealth(SCANNER_1_URL, 'Scanner-1'))
  await test('Scanner 1 - eSCL Capabilities', () => testScannerCapabilities(SCANNER_1_URL))
  await test('Scanner 1 - List documents', () => testScannerDocuments(SCANNER_1_URL))
  await test('Scanner 1 - Scan document', () => testScannerScan(SCANNER_1_URL))

  log('')
  log('=== Scanner 2 Tests ===')
  await test('Scanner 2 - Health check', () => testScannerHealth(SCANNER_2_URL, 'Scanner-2'))
  await test('Scanner 2 - eSCL Capabilities', () => testScannerCapabilities(SCANNER_2_URL))
  await test('Scanner 2 - List documents', () => testScannerDocuments(SCANNER_2_URL))
  await test('Scanner 2 - Scan document', () => testScannerScan(SCANNER_2_URL))

  log('')
  log('=== Printer 1 Tests ===')
  await test('Printer 1 - Health check', () => testPrinterHealth(PRINTER_1_URL, 'Printer-1'))
  await test('Printer 1 - Printer info', () => testPrinterInfo(PRINTER_1_URL))
  let print1Job = null
  await test('Printer 1 - Print document', async () => {
    print1Job = await testPrinterPrint(PRINTER_1_URL)
  })
  await test('Printer 1 - List jobs', () => testPrinterJobs(PRINTER_1_URL))
  if (print1Job) {
    await test('Printer 1 - Job completion', () => testPrinterJobStatus(PRINTER_1_URL, print1Job.jobId))
  }

  log('')
  log('=== Printer 2 Tests ===')
  await test('Printer 2 - Health check', () => testPrinterHealth(PRINTER_2_URL, 'Printer-2'))
  await test('Printer 2 - Printer info', () => testPrinterInfo(PRINTER_2_URL))
  let print2Job = null
  await test('Printer 2 - Print document', async () => {
    print2Job = await testPrinterPrint(PRINTER_2_URL)
  })
  await test('Printer 2 - List jobs', () => testPrinterJobs(PRINTER_2_URL))
  if (print2Job) {
    await test('Printer 2 - Job completion', () => testPrinterJobStatus(PRINTER_2_URL, print2Job.jobId))
  }

  log('')
  log('=== Results ===')
  log(`Passed: ${results.passed}`)
  log(`Failed: ${results.failed}`)
  log(`Total: ${results.tests.length}`)

  const resultsPath = '/app/results/device-test-results.json'
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2))
  log(`Results saved to ${resultsPath}`)

  process.exit(results.failed > 0 ? 1 : 0)
}

runTests().catch(err => {
  console.error('Test runner failed:', err)
  process.exit(1)
})
