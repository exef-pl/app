const express = require('express')
const { v4: uuidv4 } = require('uuid')
const fs = require('fs')
const path = require('path')

const app = express()
app.use(express.json())
app.use(express.raw({ type: '*/*', limit: '50mb' }))

const PRINTER_NAME = process.env.PRINTER_NAME || 'ExEF-Printer'
const PRINTER_PORT = parseInt(process.env.PRINTER_PORT || '8111', 10)
const PRINTER_MODEL = process.env.PRINTER_MODEL || 'Virtual Printer'
const PRINTER_SERIAL = process.env.PRINTER_SERIAL || 'VPRINT001'

const JOBS_DIR = '/app/jobs'
if (!fs.existsSync(JOBS_DIR)) {
  fs.mkdirSync(JOBS_DIR, { recursive: true })
}

const printJobs = new Map()

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    device: 'printer',
    name: PRINTER_NAME,
    model: PRINTER_MODEL,
    serial: PRINTER_SERIAL,
    protocol: 'IPP',
    timestamp: new Date().toISOString(),
    stats: {
      totalJobs: printJobs.size,
      completedJobs: Array.from(printJobs.values()).filter(j => j.state === 'completed').length,
    },
  })
})

app.get('/ipp/print', (_req, res) => {
  res.set('Content-Type', 'application/ipp')
  const ippResponse = Buffer.from([
    0x02, 0x00,
    0x00, 0x00,
    0x00, 0x00, 0x00, 0x01,
    0x01,
    0x47, 0x00, 0x12, 0x61, 0x74, 0x74, 0x72, 0x69, 0x62, 0x75, 0x74, 0x65, 0x73, 0x2d, 0x63, 0x68, 0x61, 0x72, 0x73, 0x65, 0x74,
    0x00, 0x05, 0x75, 0x74, 0x66, 0x2d, 0x38,
    0x03,
  ])
  res.send(ippResponse)
})

app.post('/ipp/print', (req, res) => {
  const jobId = uuidv4()
  const jobUri = `ipp://localhost:${PRINTER_PORT}/ipp/print/${jobId}`
  
  const job = {
    id: jobId,
    uri: jobUri,
    state: 'pending',
    stateReasons: ['none'],
    name: `print-job-${jobId.slice(0, 8)}`,
    createdAt: new Date().toISOString(),
    completedAt: null,
    pages: 1,
    copies: 1,
    documentFormat: 'application/pdf',
  }

  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    const jobFile = path.join(JOBS_DIR, `${jobId}.bin`)
    fs.writeFileSync(jobFile, req.body)
    job.fileSize = req.body.length
    job.filePath = jobFile
  }

  printJobs.set(jobId, job)

  setTimeout(() => {
    const j = printJobs.get(jobId)
    if (j) {
      j.state = 'processing'
    }
  }, 200)

  setTimeout(() => {
    const j = printJobs.get(jobId)
    if (j) {
      j.state = 'completed'
      j.completedAt = new Date().toISOString()
    }
  }, 1000)

  res.set('Content-Type', 'application/ipp')
  const successResponse = Buffer.from([
    0x02, 0x00,
    0x00, 0x00,
    0x00, 0x00, 0x00, 0x01,
    0x01,
    0x47, 0x00, 0x12, 0x61, 0x74, 0x74, 0x72, 0x69, 0x62, 0x75, 0x74, 0x65, 0x73, 0x2d, 0x63, 0x68, 0x61, 0x72, 0x73, 0x65, 0x74,
    0x00, 0x05, 0x75, 0x74, 0x66, 0x2d, 0x38,
    0x02,
    0x45, 0x00, 0x07, 0x6a, 0x6f, 0x62, 0x2d, 0x75, 0x72, 0x69,
    ...Buffer.from(jobUri),
    0x03,
  ])
  res.status(200).send(successResponse)
})

app.get('/api/printer', (_req, res) => {
  res.json({
    name: PRINTER_NAME,
    model: PRINTER_MODEL,
    serial: PRINTER_SERIAL,
    status: 'idle',
    protocol: 'IPP/2.0',
    capabilities: {
      colorSupported: true,
      duplexSupported: true,
      paperSizes: ['A4', 'A5', 'Letter', 'Legal'],
      resolutions: [300, 600, 1200],
      mediaTypes: ['plain', 'glossy', 'matte', 'envelope'],
    },
    supplies: {
      tonerBlack: 85,
      tonerCyan: 72,
      tonerMagenta: 68,
      tonerYellow: 90,
      paper: 450,
    },
  })
})

app.post('/api/print', (req, res) => {
  try {
    const { document, copies = 1, duplex = false, colorMode = 'color', paperSize = 'A4' } = req.body || {}
    
    if (!document) {
      return res.status(400).json({ error: 'Document required' })
    }

    const jobId = uuidv4()
    let fileBuffer = null
    let fileName = 'document.pdf'
    let fileType = 'application/pdf'

    if (document.content) {
      fileBuffer = Buffer.from(document.content, 'base64')
      fileName = document.fileName || fileName
      fileType = document.fileType || fileType
    } else if (document.url) {
      fileName = document.url.split('/').pop() || fileName
    }

    const job = {
      id: jobId,
      state: 'pending',
      fileName,
      fileType,
      fileSize: fileBuffer ? fileBuffer.length : 0,
      copies,
      duplex,
      colorMode,
      paperSize,
      createdAt: new Date().toISOString(),
      completedAt: null,
      printer: {
        name: PRINTER_NAME,
        model: PRINTER_MODEL,
        serial: PRINTER_SERIAL,
      },
    }

    if (fileBuffer) {
      const jobFile = path.join(JOBS_DIR, `${jobId}.bin`)
      fs.writeFileSync(jobFile, fileBuffer)
      job.filePath = jobFile
    }

    printJobs.set(jobId, job)

    setTimeout(() => {
      const j = printJobs.get(jobId)
      if (j) {
        j.state = 'processing'
      }
    }, 300)

    setTimeout(() => {
      const j = printJobs.get(jobId)
      if (j) {
        j.state = 'completed'
        j.completedAt = new Date().toISOString()
      }
    }, 1500)

    res.json({
      jobId,
      status: 'accepted',
      message: `Print job ${jobId} created`,
      estimatedTime: '2 seconds',
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/jobs', (_req, res) => {
  const jobs = Array.from(printJobs.values()).map(j => ({
    id: j.id,
    state: j.state,
    fileName: j.fileName,
    fileSize: j.fileSize,
    copies: j.copies,
    createdAt: j.createdAt,
    completedAt: j.completedAt,
  }))
  res.json({ jobs, total: jobs.length })
})

app.get('/api/jobs/:jobId', (req, res) => {
  const job = printJobs.get(req.params.jobId)
  if (!job) {
    return res.status(404).json({ error: 'Job not found' })
  }
  res.json(job)
})

app.delete('/api/jobs/:jobId', (req, res) => {
  const job = printJobs.get(req.params.jobId)
  if (!job) {
    return res.status(404).json({ error: 'Job not found' })
  }
  
  if (job.filePath && fs.existsSync(job.filePath)) {
    fs.unlinkSync(job.filePath)
  }
  
  printJobs.delete(req.params.jobId)
  res.json({ deleted: true, jobId: req.params.jobId })
})

app.post('/api/jobs/:jobId/cancel', (req, res) => {
  const job = printJobs.get(req.params.jobId)
  if (!job) {
    return res.status(404).json({ error: 'Job not found' })
  }
  
  if (job.state === 'completed') {
    return res.status(400).json({ error: 'Job already completed' })
  }
  
  job.state = 'cancelled'
  job.completedAt = new Date().toISOString()
  res.json({ cancelled: true, jobId: req.params.jobId })
})

app.listen(PRINTER_PORT, '0.0.0.0', () => {
  console.log(`${PRINTER_NAME} (${PRINTER_MODEL}) listening on port ${PRINTER_PORT}`)
  console.log(`IPP endpoint: http://localhost:${PRINTER_PORT}/ipp/print`)
  console.log(`API endpoint: http://localhost:${PRINTER_PORT}/api/print`)
})
