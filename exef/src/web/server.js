const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const dotenv = require('dotenv')
dotenv.config(process.env.EXEF_ENV_FILE ? { path: process.env.EXEF_ENV_FILE } : {})

const { createKsefFacade } = require('../core/ksefFacade')
const { listenWithFallback } = require('../core/listen')

const app = express()
app.use(helmet())
app.use(cors())
app.use(express.json({ limit: '10mb' }))

const ksef = createKsefFacade({})

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'exef-web' })
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

const host = process.env.EXEF_WEB_HOST ?? process.env.HOST ?? '0.0.0.0'
const preferredPort = Number(
  process.env.EXEF_WEB_INTERNAL_PORT ?? process.env.EXEF_WEB_PORT ?? process.env.PORT ?? 3000
)
const maxTries = Number(process.env.EXEF_WEB_PORT_MAX_TRIES ?? 50)

listenWithFallback(app, {
  host,
  port: Number.isNaN(preferredPort) ? 0 : preferredPort,
  maxTries: Number.isNaN(maxTries) ? 50 : maxTries,
  allowRandom: false,
}).then(({ port }) => {
  process.stdout.write(`exef-web listening on ${host}:${port}\n`)
}).catch((err) => {
  process.stderr.write(`${err?.stack ?? err}\n`)
  process.exit(1)
})
