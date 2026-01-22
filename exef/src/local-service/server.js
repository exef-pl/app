const express = require('express')
const helmet = require('helmet')
const dotenv = require('dotenv')
dotenv.config(process.env.EXEF_ENV_FILE ? { path: process.env.EXEF_ENV_FILE } : {})
const fs = require('node:fs')
const path = require('node:path')

const { createKsefFacade } = require('../core/ksefFacade')
const { listenWithFallback } = require('../core/listen')
const { createInvoiceWorkflow, INVOICE_STATUS } = require('../core/invoiceWorkflow')
const { createStore } = require('../core/draftStore')
const { EXPORT_FORMATS } = require('../core/exportService')

const app = express()
app.use(helmet())
app.use(express.json({ limit: '10mb' }))

const ksef = createKsefFacade({})

const store = createStore({
  filePath: process.env.EXEF_INVOICE_STORE_PATH || './data/invoices.json',
})
const workflow = createInvoiceWorkflow({
  store,
  ksefFacade: ksef,
  watchPaths: process.env.EXEF_WATCH_PATHS ? process.env.EXEF_WATCH_PATHS.split(',') : [],
})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'exef-local-service' })
})

app.post('/ksef/auth/token', async (req, res) => {
  try {
    const result = await ksef.authenticateWithKsefToken(req.body)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/ksef/sessions/online/open', async (req, res) => {
  try {
    const result = await ksef.openOnlineSession(req.body)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/ksef/sessions/online/close', async (req, res) => {
  try {
    const result = await ksef.closeOnlineSession(req.body)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/ksef/sessions/online/send', async (req, res) => {
  try {
    const result = await ksef.sendOnlineInvoice(req.body)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/ksef/invoices/query', async (req, res) => {
  try {
    const result = await ksef.queryInvoiceMetadata(req.body)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/ksef/invoices/status', async (req, res) => {
  try {
    const result = await ksef.getInvoiceStatus(req.body)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/ksef/invoices/download', async (req, res) => {
  try {
    const result = await ksef.downloadInvoice(req.body)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/inbox/stats', async (_req, res) => {
  try {
    const stats = await workflow.getStats()
    res.json(stats)
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/inbox/invoices', async (req, res) => {
  try {
    const filter = {
      status: req.query.status,
      source: req.query.source,
      since: req.query.since,
    }
    const invoices = await workflow.listInvoices(filter)
    res.json({ invoices, count: invoices.length })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/inbox/invoices/:id', async (req, res) => {
  try {
    const invoice = await workflow.getInvoice(req.params.id)
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' })
    }
    res.json(invoice)
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/inbox/invoices', async (req, res) => {
  try {
    const { source, file, metadata } = req.body
    const invoice = await workflow.addManualInvoice(source || 'scanner', file, metadata || {})
    res.status(201).json(invoice)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/inbox/invoices/:id/process', async (req, res) => {
  try {
    const invoice = await workflow.processInvoice(req.params.id)
    res.json(invoice)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/inbox/invoices/:id/approve', async (req, res) => {
  try {
    const invoice = await workflow.approveInvoice(req.params.id, req.body)
    res.json(invoice)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/inbox/invoices/:id/reject', async (req, res) => {
  try {
    const invoice = await workflow.rejectInvoice(req.params.id, req.body.reason)
    res.json(invoice)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/inbox/export', async (req, res) => {
  try {
    const format = req.body.format || EXPORT_FORMATS.CSV
    const result = await workflow.exportApproved(format, req.body.options || {})
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/inbox/ksef/poll', async (req, res) => {
  try {
    const { accessToken, since } = req.body
    const invoices = await ksef.pollNewInvoices({ accessToken, since })
    for (const invData of invoices) {
      await workflow.addManualInvoice('ksef', null, invData)
    }
    res.json({ added: invoices.length, invoices })
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

function writePortFile(filePath, portNumber) {
  if (!filePath) {
    return
  }
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, String(portNumber), { encoding: 'utf8' })
  } catch (_e) {
  }
}

const host = process.env.EXEF_LOCAL_SERVICE_HOST ?? process.env.LOCAL_SERVICE_HOST ?? '127.0.0.1'
const preferredPort = Number(process.env.EXEF_LOCAL_SERVICE_PORT ?? process.env.LOCAL_SERVICE_PORT ?? 3030)
const maxTries = Number(process.env.EXEF_LOCAL_SERVICE_PORT_MAX_TRIES ?? 50)
const portFile = process.env.EXEF_LOCAL_SERVICE_PORT_FILE

listenWithFallback(app, {
  host,
  port: Number.isNaN(preferredPort) ? 0 : preferredPort,
  maxTries: Number.isNaN(maxTries) ? 50 : maxTries,
  allowRandom: true,
}).then(({ port }) => {
  writePortFile(portFile, port)
  process.stdout.write(`exef-local-service listening on http://${host}:${port}\n`)
}).catch((err) => {
  process.stderr.write(`${err?.stack ?? err}\n`)
  process.exit(1)
})
