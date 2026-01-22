const assert = require('node:assert')
const { describe, it } = require('node:test')

const BASE_URL = process.env.EXEF_TEST_URL || 'http://127.0.0.1:3030'
const MOCK_URL = process.env.MOCK_GOOGLE_VISION_API_URL || 'http://mock-google-vision-api:8095'

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms))
}

async function waitFor(fn, { timeoutMs = 15000, intervalMs = 200 } = {}) {
  const start = Date.now()
  let lastErr = null
  while (Date.now() - start < timeoutMs) {
    try {
      const val = await fn()
      if (val) {
        return val
      }
    } catch (e) {
      lastErr = e
    }
    await sleep(intervalMs)
  }
  throw new Error(`timeout waiting for condition${lastErr ? `: ${lastErr.message}` : ''}`)
}

function makeTinyPdfBuffer() {
  const pdf = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'
  return Buffer.from(pdf, 'utf8')
}

describe('OCR REST (mock Google Vision)', () => {
  it('processes PDF via google-vision provider and sends file content to mock API', async () => {
    await waitFor(async () => {
      const res = await fetch(`${BASE_URL}/health`)
      return res.ok
    })

    await waitFor(async () => {
      const res = await fetch(`${BASE_URL}/settings`)
      if (!res.ok) return false
      const json = await res.json().catch(() => null)
      return String(json?.ocr?.provider || '').toLowerCase() === 'google-vision'
    }, { timeoutMs: 20000 })

    const pdfBuf = makeTinyPdfBuffer()
    const dataUrl = `data:application/pdf;base64,${pdfBuf.toString('base64')}`

    const createRes = await fetch(`${BASE_URL}/inbox/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'scanner',
        file: dataUrl,
        metadata: {
          fileName: 'sample.pdf',
          fileType: 'application/pdf',
          fileSize: pdfBuf.length,
        },
      }),
    })
    assert.strictEqual(createRes.ok, true)
    const created = await createRes.json()
    assert.ok(created && created.id)

    const procRes = await fetch(`${BASE_URL}/inbox/invoices/${encodeURIComponent(created.id)}/process`, { method: 'POST' })
    assert.strictEqual(procRes.ok, true)
    const processed = await procRes.json()

    assert.strictEqual(processed.status, 'described')
    assert.strictEqual(processed.invoiceNumber, 'FV/2026/01/001')
    assert.ok(processed.ocrData && typeof processed.ocrData === 'object')
    assert.ok(String(processed.ocrData.rawText || '').includes('FV/2026/01/001'))

    const lastRes = await fetch(`${MOCK_URL}/admin/last`)
    assert.strictEqual(lastRes.ok, true)
    const lastJson = await lastRes.json()
    const last = lastJson && typeof lastJson === 'object' ? lastJson.last : null
    assert.ok(last)
    assert.strictEqual(last.decodedBytesLength, pdfBuf.length)
    assert.ok(last.base64Length > 0)
    assert.strictEqual(last.key, 'test-key')
  })
})
