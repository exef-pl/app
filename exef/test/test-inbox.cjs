#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const net = require('node:net')

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

async function testExportDocumentsZip() {
  console.log('\n[TEST] POST /inbox/export/documents.zip (ZIP)')

  const projectId = `PRJ-ZIP-${Date.now()}`
  const expenseTypeId = `ET-ZIP-${Date.now()}`

  const pRes = await fetch(`${BASE_URL}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: projectId, nazwa: 'Projekt ZIP', status: 'aktywny' }),
  })
  await pRes.json().catch(() => ({}))

  const etRes = await fetch(`${BASE_URL}/expense-types`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: expenseTypeId, nazwa: 'Koszt ZIP', opis: '' }),
  })
  await etRes.json().catch(() => ({}))

  const addRes = await fetch(`${BASE_URL}/inbox/invoices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'scanner',
      file: 'data:image/png;base64,AA==',
      metadata: {
        fileName: 'zipdoc.png',
        fileType: 'image/png',
      },
    }),
  })
  const addJson = await addRes.json().catch(() => ({}))
  if (!addRes.ok || !addJson?.id) {
    return false
  }
  const invoiceId = addJson.id

  const assignProjRes = await fetch(`${BASE_URL}/inbox/invoices/${encodeURIComponent(invoiceId)}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  })
  if (!assignProjRes.ok) {
    return false
  }

  const assignEtRes = await fetch(`${BASE_URL}/inbox/invoices/${encodeURIComponent(invoiceId)}/assign-expense-type`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expenseTypeId }),
  })
  if (!assignEtRes.ok) {
    return false
  }

  const approveRes = await fetch(`${BASE_URL}/inbox/invoices/${encodeURIComponent(invoiceId)}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  if (!approveRes.ok) {
    return false
  }

  const zipRes = await fetch(`${BASE_URL}/inbox/export/documents.zip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'approved', ids: [invoiceId] }),
  })

  console.log('  Zip status:', zipRes.status)
  if (!zipRes.ok) {
    const err = await zipRes.json().catch(() => ({}))
    console.log('  Zip response:', JSON.stringify(err))
    return false
  }

  const buf = Buffer.from(await zipRes.arrayBuffer())
  if (buf.length < 4) {
    console.log('  Zip too small')
    return false
  }
  const sig = buf.slice(0, 2).toString('utf8')
  if (sig !== 'PK') {
    console.log('  Not a zip (signature):', sig)
    return false
  }

  return true
}

function startSmtpMockServer() {
  return new Promise((resolve, reject) => {
    let lastMessage = null
    let resolveMessage
    const messagePromise = new Promise((r) => {
      resolveMessage = r
    })

    const server = net.createServer((socket) => {
      socket.setTimeout(15000)
      socket.write('220 exef-smtp-mock\r\n')

      let mode = 'cmd'
      let buf = ''
      let dataBuf = ''

      const send = (line) => {
        socket.write(`${line}\r\n`)
      }

      socket.on('data', (chunk) => {
        buf += chunk.toString('utf8')

        while (true) {
          if (mode === 'data') {
            const endIdx = buf.indexOf('\r\n.\r\n')
            if (endIdx === -1) {
              dataBuf += buf
              buf = ''
              break
            }
            dataBuf += buf.slice(0, endIdx)
            buf = buf.slice(endIdx + 5)
            lastMessage = dataBuf
            dataBuf = ''
            mode = 'cmd'
            send('250 OK')
            resolveMessage(lastMessage)
            continue
          }

          const idx = buf.indexOf('\r\n')
          if (idx === -1) {
            break
          }
          const line = buf.slice(0, idx)
          buf = buf.slice(idx + 2)

          const upper = String(line || '').toUpperCase()
          if (upper.startsWith('EHLO')) {
            send('250-mock')
            send('250 OK')
          } else if (upper.startsWith('HELO')) {
            send('250 OK')
          } else if (upper.startsWith('MAIL FROM')) {
            send('250 OK')
          } else if (upper.startsWith('RCPT TO')) {
            send('250 OK')
          } else if (upper === 'DATA') {
            mode = 'data'
            send('354 End data with <CRLF>.<CRLF>')
          } else if (upper === 'QUIT') {
            send('221 Bye')
            try {
              socket.end()
            } catch (_e) {
            }
          } else {
            send('250 OK')
          }
        }
      })
    })

    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = addr && typeof addr === 'object' ? addr.port : null
      resolve({
        port,
        close: () => new Promise((r) => server.close(() => r())),
        message: () => messagePromise,
      })
    })
  })
}

async function testExportSendEmail() {
  console.log('\n[TEST] POST /inbox/export/send-email (SMTP mock)')

  const smtp = await startSmtpMockServer()
  try {
    const res = await fetch(`${BASE_URL}/inbox/export/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'dest@example.com',
        from: 'sender@example.com',
        subject: 'ExEF export test',
        type: 'format',
        format: 'kpir_csv',
        smtp: {
          host: '127.0.0.1',
          port: smtp.port,
          secure: false,
          starttls: false,
        },
      }),
    })

    const json = await res.json().catch(() => ({}))
    console.log('  Status:', res.status)
    if (!res.ok) {
      console.log('  Error:', JSON.stringify(json))
      return false
    }

    const msg = await Promise.race([
      smtp.message(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('smtp_message_timeout')), 5000)),
    ])

    if (!msg || typeof msg !== 'string') {
      console.log('  No message captured')
      return false
    }

    if (!msg.includes('Subject: ExEF export test')) {
      console.log('  Subject missing')
      return false
    }

    if (!msg.toLowerCase().includes('content-disposition: attachment')) {
      console.log('  Attachment missing')
      return false
    }

    return true
  } finally {
    await smtp.close().catch(() => {})
  }
}

async function testExportFilesFiltering() {
  console.log('\n[TEST] POST /inbox/export/files (filtering)')

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exef-export-filter-'))
  const projectId1 = `PRJ-A-${Date.now()}`
  const projectId2 = `PRJ-B-${Date.now()}`
  const expenseTypeId = `ET-${Date.now()}`

  try {
    await fetch(`${BASE_URL}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId1, nazwa: 'Projekt A', status: 'aktywny' }),
    }).then((r) => r.json().catch(() => ({})))

    await fetch(`${BASE_URL}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId2, nazwa: 'Projekt B', status: 'aktywny' }),
    }).then((r) => r.json().catch(() => ({})))

    await fetch(`${BASE_URL}/expense-types`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: expenseTypeId, nazwa: 'Koszt', opis: '' }),
    }).then((r) => r.json().catch(() => ({})))

    async function createApproved(projectId, fileName) {
      const addRes = await fetch(`${BASE_URL}/inbox/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'scanner',
          file: 'data:image/png;base64,AA==',
          metadata: { fileName, fileType: 'image/png' },
        }),
      })
      const addJson = await addRes.json().catch(() => ({}))
      if (!addRes.ok || !addJson?.id) {
        throw new Error('failed_to_add_invoice')
      }
      const id = addJson.id

      await fetch(`${BASE_URL}/inbox/invoices/${encodeURIComponent(id)}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })

      await fetch(`${BASE_URL}/inbox/invoices/${encodeURIComponent(id)}/assign-expense-type`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expenseTypeId }),
      })

      await fetch(`${BASE_URL}/inbox/invoices/${encodeURIComponent(id)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      return id
    }

    await createApproved(projectId1, 'a.png')
    await createApproved(projectId2, 'b.png')

    const exportRes = await fetch(`${BASE_URL}/inbox/export/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outputDir: tmpDir, status: 'approved', projectId: [projectId1] }),
    })
    const exportJson = await exportRes.json().catch(() => ({}))
    console.log('  Export status:', exportRes.status)
    if (!exportRes.ok) {
      console.log('  Export response:', JSON.stringify(exportJson))
      return false
    }

    if (exportJson.matched !== 1 || exportJson.exported !== 1) {
      console.log('  Unexpected counts:', JSON.stringify(exportJson))
      return false
    }

    const expenseDirs = fs.readdirSync(tmpDir, { withFileTypes: true }).filter((d) => d.isDirectory())
    if (expenseDirs.length !== 1) {
      console.log('  Expected 1 expense dir, got', expenseDirs.length)
      return false
    }
    const projectDirs = fs.readdirSync(path.join(tmpDir, expenseDirs[0].name), { withFileTypes: true }).filter((d) => d.isDirectory())
    if (projectDirs.length !== 1) {
      console.log('  Expected 1 project dir, got', projectDirs.length)
      return false
    }
    const files = fs.readdirSync(path.join(tmpDir, expenseDirs[0].name, projectDirs[0].name))
    if (files.length !== 1) {
      console.log('  Expected 1 exported file, got', files.length)
      return false
    }
    if (!files[0].includes('a.png') && !files[0].endsWith('.png')) {
      console.log('  Unexpected exported file name:', files[0])
      return false
    }

    return true
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch (_e) {
    }
  }
}

async function testSettingsOcrExternalApiMock() {
  console.log('\n[TEST] PUT /settings (ocr external-api mock)')

  const settingsRes = await fetch(`${BASE_URL}/settings`)
  const originalSettings = await settingsRes.json().catch(() => null)
  if (!settingsRes.ok || !originalSettings) {
    console.log('  Cannot read settings, skip')
    return false
  }

  const originalOcr = originalSettings?.ocr || null

  let invoiceId = null

  try {
    const putRes = await fetch(`${BASE_URL}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ocr: {
          provider: 'external-api',
          api: {
            externalUrl: 'mock://ocr',
            mockText: 'Faktura FV/2026/01/XYZ',
          },
        },
      }),
    })
    const putJson = await putRes.json().catch(() => ({}))
    console.log('  Settings status:', putRes.status)
    if (!putRes.ok) {
      console.log('  Settings response:', JSON.stringify(putJson))
      return false
    }

    const addRes = await fetch(`${BASE_URL}/inbox/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'scanner',
        file: 'data:image/png;base64,AA==',
        metadata: {
          fileName: 'mock.png',
          fileType: 'image/png',
        },
      }),
    })
    const addJson = await addRes.json().catch(() => ({}))
    console.log('  Add invoice status:', addRes.status)
    if (!addRes.ok || !addJson?.id) {
      console.log('  Add invoice response:', JSON.stringify(addJson))
      return false
    }
    invoiceId = addJson.id

    const procRes = await fetch(`${BASE_URL}/inbox/invoices/${encodeURIComponent(invoiceId)}/process`, { method: 'POST' })
    const procJson = await procRes.json().catch(() => ({}))
    console.log('  Process status:', procRes.status)
    if (!procRes.ok) {
      console.log('  Process response:', JSON.stringify(procJson))
      return false
    }

    return String(procJson?.invoiceNumber || '') === 'FV/2026/01/XYZ'
  } finally {
    try {
      await fetch(`${BASE_URL}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ocr: originalOcr,
        }),
      })
    } catch (_e) {
    }
  }
}

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

async function testExportKpirCsv() {
  console.log('\n[TEST] POST /inbox/export (KPiR CSV)')
  const res = await fetch(`${BASE_URL}/inbox/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'kpir_csv' }),
  })
  const json = await res.json().catch(() => ({}))
  console.log('  Status:', res.status)
  if (!res.ok) {
    console.log('  Error:', JSON.stringify(json))
    return false
  }

  const content = String(json.content || '')
  if (!content) {
    console.log('  Empty content')
    return false
  }

  const firstLine = content.split('\n')[0] || ''
  if (!firstLine.includes('nr_ksef') || !firstLine.includes('nr_dowodu')) {
    console.log('  Unexpected header:', firstLine)
    return false
  }

  return true
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

async function testExportFilesHierarchy() {
  console.log('\n[TEST] POST /inbox/export/files (hierarchy)')

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'exef-export-'))
  const projectId = `PRJ-${Date.now()}`
  const expenseTypeId = `ET-${Date.now()}`

  try {
    const pRes = await fetch(`${BASE_URL}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, nazwa: 'Projekt Test', status: 'aktywny' }),
    })
    await pRes.json().catch(() => ({}))

    const etRes = await fetch(`${BASE_URL}/expense-types`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: expenseTypeId, nazwa: 'Koszt Test', opis: '' }),
    })
    await etRes.json().catch(() => ({}))

    const addRes = await fetch(`${BASE_URL}/inbox/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'scanner',
        file: 'data:image/png;base64,AA==',
        metadata: {
          fileName: 'doc.png',
          fileType: 'image/png',
        },
      }),
    })
    const addJson = await addRes.json().catch(() => ({}))
    if (!addRes.ok || !addJson?.id) {
      return false
    }
    const invoiceId = addJson.id

    const assignProjRes = await fetch(`${BASE_URL}/inbox/invoices/${encodeURIComponent(invoiceId)}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    })
    if (!assignProjRes.ok) {
      return false
    }

    const assignEtRes = await fetch(`${BASE_URL}/inbox/invoices/${encodeURIComponent(invoiceId)}/assign-expense-type`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expenseTypeId }),
    })
    if (!assignEtRes.ok) {
      return false
    }

    const approveRes = await fetch(`${BASE_URL}/inbox/invoices/${encodeURIComponent(invoiceId)}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (!approveRes.ok) {
      return false
    }

    const exportRes = await fetch(`${BASE_URL}/inbox/export/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outputDir: tmpDir, status: 'approved' }),
    })
    const exportJson = await exportRes.json().catch(() => ({}))
    console.log('  Export status:', exportRes.status)
    if (!exportRes.ok) {
      console.log('  Export response:', JSON.stringify(exportJson))
      return false
    }

    const rootEntries = fs.readdirSync(tmpDir, { withFileTypes: true })
    const expenseDir = rootEntries.find((e) => e.isDirectory())
    if (!expenseDir) {
      console.log('  No expense-type folder created')
      return false
    }

    const expensePath = path.join(tmpDir, expenseDir.name)
    const projectEntries = fs.readdirSync(expensePath, { withFileTypes: true })
    const projectDir = projectEntries.find((e) => e.isDirectory())
    if (!projectDir) {
      console.log('  No project folder created')
      return false
    }

    const projectPath = path.join(expensePath, projectDir.name)
    const docs = fs.readdirSync(projectPath)
    const hasDoc = docs.some((n) => n.includes('doc.png') || n.endsWith('.png'))
    if (!hasDoc) {
      console.log('  No document exported into hierarchy folder')
      return false
    }

    return true
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch (_e) {
    }
  }
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
    results.push({ name: 'settings ocr external-api mock', ok: await testSettingsOcrExternalApiMock() })
    results.push({ name: 'storage local folder -> process (xml)', ok: await testLocalFolderStorageSyncImportAndProcess() })

    const jsonInvoiceId = await testAddInvoiceFromJson()
    results.push({ name: 'add invoice (JSON)', ok: !!jsonInvoiceId })

    const xmlInvoiceId = await testAddInvoiceFromXml()
    results.push({ name: 'add invoice (XML)', ok: !!xmlInvoiceId })

    results.push({ name: 'list invoices', ok: await testListInvoices() })

    results.push({ name: 'process invoice', ok: await testProcessInvoice(jsonInvoiceId) })
    results.push({ name: 'approve invoice', ok: await testApproveInvoice(jsonInvoiceId) })
    results.push({ name: 'export CSV', ok: await testExportCsv() })
    results.push({ name: 'export KPiR CSV', ok: await testExportKpirCsv() })
    results.push({ name: 'export send email', ok: await testExportSendEmail() })
    results.push({ name: 'ksef auth', ok: await testKsefEndpoints() })
    results.push({ name: 'export files hierarchy', ok: await testExportFilesHierarchy() })
    results.push({ name: 'export files filtering', ok: await testExportFilesFiltering() })
    results.push({ name: 'export documents zip', ok: await testExportDocumentsZip() })
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
