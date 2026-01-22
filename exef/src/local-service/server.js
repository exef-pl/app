const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
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
app.use(helmet({ 
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "http://127.0.0.1:*", "http://localhost:*", "ws://127.0.0.1:*", "ws://localhost:*"],
      imgSrc: ["'self'", "data:", "http:", "https:"],
      fontSrc: ["'self'", "data:", "http:", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false
}))

// Override CSP for static files to allow inline scripts
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/') {
    res.setHeader('Content-Security-Policy', 
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*; " +
      "img-src 'self' data: http: https:; " +
      "font-src 'self' data: http: https:; " +
      "object-src 'none'; " +
      "media-src 'self'; " +
      "frame-src 'none'"
    );
  }
  next();
});

app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.use('/test', express.static(path.join(__dirname, '../../test/gui')))

app.get('/', (_req, res) => {
  res.redirect('/test/')
})

// Serve desktop renderer with CSP override
app.use('/', (req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    const filePath = path.join(__dirname, '../desktop/renderer', req.path === '/' ? 'index.html' : req.path);
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      // Remove CSP meta tag and let server handle it
      content = content.replace(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');
      res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*; " +
        "img-src 'self' data: http: https:; " +
        "font-src 'self' data: http: https:; " +
        "object-src 'none'; " +
        "media-src 'self'; " +
        "frame-src 'none'"
      );
      res.send(content);
      return;
    }
  }
  next();
}, express.static(path.join(__dirname, '../desktop/renderer')))

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

// Projects management endpoints
app.get('/projects', async (_req, res) => {
  try {
    const projectsPath = path.join(__dirname, '../../data/projects.csv')
    if (!fs.existsSync(projectsPath)) {
      return res.json({ projects: [] })
    }
    
    const content = fs.readFileSync(projectsPath, 'utf8')
    const lines = content.split('\n').filter(line => line.trim())
    
    if (lines.length < 2) {
      return res.json({ projects: [] })
    }
    
    const headers = lines[0].split(',').map(h => h.trim())
    const projects = []
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      if (values.length === headers.length && values[0]) {
        const project = {}
        headers.forEach((header, index) => {
          project[header.toLowerCase()] = values[index]
        })
        projects.push(project)
      }
    }
    
    res.json({ projects })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/projects', async (req, res) => {
  try {
    const { id, nazwa, klient, nip, budzet, status, opis } = req.body
    
    if (!id || !nazwa) {
      return res.status(400).json({ error: 'ID and Nazwa are required' })
    }
    
    const projectsPath = path.join(__dirname, '../../data/projects.csv')
    let content = ''
    
    if (fs.existsSync(projectsPath)) {
      content = fs.readFileSync(projectsPath, 'utf8')
      const lines = content.split('\n').filter(line => line.trim())
      
      // Check if project already exists
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
        if (values[0] === id) {
          return res.status(400).json({ error: 'Project with this ID already exists' })
        }
      }
      
      // Keep only header line
      content = lines[0] + '\n'
    } else {
      // Create new file with header
      content = 'ID,Nazwa,Klient,NIP,Budżet,Status,Opis\n'
    }
    
    // Add new project
    const newLine = `${id},"${nazwa}","${klient || ''}","${nip || ''}",${budzet || 0},"${status || 'aktywny'}","${opis || ''}"\n`
    fs.writeFileSync(projectsPath, content + newLine, 'utf8')
    
    res.status(201).json({ 
      id, 
      nazwa, 
      klient, 
      nip, 
      budzet, 
      status, 
      opis,
      message: 'Project created successfully' 
    })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.put('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { nazwa, klient, nip, budzet, status, opis } = req.body
    
    const projectsPath = path.join(__dirname, '../../data/projects.csv')
    if (!fs.existsSync(projectsPath)) {
      return res.status(404).json({ error: 'Projects file not found' })
    }
    
    const content = fs.readFileSync(projectsPath, 'utf8')
    const lines = content.split('\n').filter(line => line.trim())
    
    if (lines.length < 2) {
      return res.status(404).json({ error: 'No projects found' })
    }
    
    let projectFound = false
    const updatedLines = [lines[0]] // Keep header
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      if (values[0] === id) {
        projectFound = true
        const updatedProject = {
          id,
          nazwa: nazwa || values[1],
          klient: klient || values[2],
          nip: nip || values[3],
          budzet: budzet || values[4],
          status: status || values[5],
          opis: opis || values[6]
        }
        const updatedLine = `${id},"${updatedProject.nazwa}","${updatedProject.klient}","${updatedProject.nip}",${updatedProject.budzet},"${updatedProject.status}","${updatedProject.opis}"`
        updatedLines.push(updatedLine)
      } else {
        updatedLines.push(lines[i])
      }
    }
    
    if (!projectFound) {
      return res.status(404).json({ error: 'Project not found' })
    }
    
    fs.writeFileSync(projectsPath, updatedLines.join('\n'), 'utf8')
    
    res.json({ 
      id, 
      nazwa, 
      klient, 
      nip, 
      budzet, 
      status, 
      opis,
      message: 'Project updated successfully' 
    })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.delete('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params
    
    const projectsPath = path.join(__dirname, '../../data/projects.csv')
    if (!fs.existsSync(projectsPath)) {
      return res.status(404).json({ error: 'Projects file not found' })
    }
    
    const content = fs.readFileSync(projectsPath, 'utf8')
    const lines = content.split('\n').filter(line => line.trim())
    
    if (lines.length < 2) {
      return res.status(404).json({ error: 'No projects found' })
    }
    
    let projectFound = false
    const updatedLines = [lines[0]] // Keep header
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      if (values[0] !== id) {
        updatedLines.push(lines[i])
      } else {
        projectFound = true
      }
    }
    
    if (!projectFound) {
      return res.status(404).json({ error: 'Project not found' })
    }
    
    fs.writeFileSync(projectsPath, updatedLines.join('\n'), 'utf8')
    
    res.json({ message: 'Project deleted successfully' })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

// Assign invoice to project
app.post('/inbox/invoices/:id/assign', async (req, res) => {
  try {
    const { projectId } = req.body
    
    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required' })
    }
    
    const invoice = await workflow.assignInvoiceToProject(req.params.id, projectId)
    res.json(invoice)
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
