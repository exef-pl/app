const express = require('express')
const { v4: uuidv4 } = require('uuid')
const fs = require('fs')
const path = require('path')

const app = express()
app.use(express.json())
app.use(express.raw({ type: '*/*', limit: '50mb' }))

const SCANNER_NAME = process.env.SCANNER_NAME || 'ExEF-Scanner'
const SCANNER_PORT = parseInt(process.env.SCANNER_PORT || '8101', 10)
const SCANNER_MODEL = process.env.SCANNER_MODEL || 'Virtual Scanner'
const SCANNER_SERIAL = process.env.SCANNER_SERIAL || 'VSCAN001'

const scanJobs = new Map()

const sampleDocuments = [
  {
    id: 'sample-invoice-1',
    name: 'Faktura_FV_2024_001.pdf',
    type: 'application/pdf',
    content: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'),
  },
  {
    id: 'sample-invoice-2',
    name: 'Paragon_2024_001.jpg',
    type: 'image/jpeg',
    content: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]),
  },
  {
    id: 'sample-invoice-3',
    name: 'Rachunek_biuro.png',
    type: 'image/png',
    content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
]

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    device: 'scanner',
    name: SCANNER_NAME,
    model: SCANNER_MODEL,
    serial: SCANNER_SERIAL,
    protocol: 'eSCL',
    timestamp: new Date().toISOString(),
  })
})

app.get('/eSCL/ScannerCapabilities', (_req, res) => {
  res.set('Content-Type', 'application/xml')
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<scan:ScannerCapabilities xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:Version>2.63</pwg:Version>
  <pwg:MakeAndModel>${SCANNER_MODEL}</pwg:MakeAndModel>
  <pwg:SerialNumber>${SCANNER_SERIAL}</pwg:SerialNumber>
  <scan:UUID>${uuidv4()}</scan:UUID>
  <scan:AdminURI>http://localhost:${SCANNER_PORT}/</scan:AdminURI>
  <scan:IconURI>http://localhost:${SCANNER_PORT}/icon.png</scan:IconURI>
  <scan:Platen>
    <scan:PlatenInputCaps>
      <scan:MinWidth>1</scan:MinWidth>
      <scan:MaxWidth>2550</scan:MaxWidth>
      <scan:MinHeight>1</scan:MinHeight>
      <scan:MaxHeight>3508</scan:MaxHeight>
      <scan:MaxScanRegions>1</scan:MaxScanRegions>
      <scan:SettingProfiles>
        <scan:SettingProfile>
          <scan:ColorModes>
            <scan:ColorMode>BlackAndWhite1</scan:ColorMode>
            <scan:ColorMode>Grayscale8</scan:ColorMode>
            <scan:ColorMode>RGB24</scan:ColorMode>
          </scan:ColorModes>
          <scan:ContentTypes>
            <pwg:ContentType>Photo</pwg:ContentType>
            <pwg:ContentType>Text</pwg:ContentType>
            <pwg:ContentType>TextAndPhoto</pwg:ContentType>
          </scan:ContentTypes>
          <scan:DocumentFormats>
            <pwg:DocumentFormat>application/pdf</pwg:DocumentFormat>
            <pwg:DocumentFormat>image/jpeg</pwg:DocumentFormat>
            <pwg:DocumentFormat>image/png</pwg:DocumentFormat>
          </scan:DocumentFormats>
          <scan:SupportedResolutions>
            <scan:DiscreteResolutions>
              <scan:DiscreteResolution><scan:XResolution>150</scan:XResolution><scan:YResolution>150</scan:YResolution></scan:DiscreteResolution>
              <scan:DiscreteResolution><scan:XResolution>300</scan:XResolution><scan:YResolution>300</scan:YResolution></scan:DiscreteResolution>
              <scan:DiscreteResolution><scan:XResolution>600</scan:XResolution><scan:YResolution>600</scan:YResolution></scan:DiscreteResolution>
            </scan:DiscreteResolutions>
          </scan:SupportedResolutions>
        </scan:SettingProfile>
      </scan:SettingProfiles>
    </scan:PlatenInputCaps>
  </scan:Platen>
  <scan:Adf>
    <scan:AdfSimplexInputCaps>
      <scan:MinWidth>1</scan:MinWidth>
      <scan:MaxWidth>2550</scan:MaxWidth>
      <scan:MinHeight>1</scan:MinHeight>
      <scan:MaxHeight>4200</scan:MaxHeight>
      <scan:MaxScanRegions>1</scan:MaxScanRegions>
    </scan:AdfSimplexInputCaps>
    <scan:FeederCapacity>50</scan:FeederCapacity>
  </scan:Adf>
</scan:ScannerCapabilities>`)
})

app.get('/eSCL/ScannerStatus', (_req, res) => {
  res.set('Content-Type', 'application/xml')
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<scan:ScannerStatus xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:Version>2.63</pwg:Version>
  <pwg:State>Idle</pwg:State>
  <scan:Jobs>
    <scan:JobInfo>
      <pwg:JobState>Completed</pwg:JobState>
      <pwg:ImagesToTransfer>0</pwg:ImagesToTransfer>
    </scan:JobInfo>
  </scan:Jobs>
</scan:ScannerStatus>`)
})

app.post('/eSCL/ScanJobs', (req, res) => {
  const jobId = uuidv4()
  const sampleDoc = sampleDocuments[Math.floor(Math.random() * sampleDocuments.length)]
  
  scanJobs.set(jobId, {
    id: jobId,
    state: 'Processing',
    createdAt: new Date().toISOString(),
    document: sampleDoc,
    imagesAvailable: 1,
  })

  setTimeout(() => {
    const job = scanJobs.get(jobId)
    if (job) {
      job.state = 'Completed'
    }
  }, 500)

  res.set('Location', `/eSCL/ScanJobs/${jobId}`)
  res.status(201).send('')
})

app.get('/eSCL/ScanJobs/:jobId', (req, res) => {
  const job = scanJobs.get(req.params.jobId)
  if (!job) {
    return res.status(404).send('Job not found')
  }

  res.set('Content-Type', 'application/xml')
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<scan:Job xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm">
  <pwg:JobUri>/eSCL/ScanJobs/${job.id}</pwg:JobUri>
  <pwg:JobUuid>${job.id}</pwg:JobUuid>
  <pwg:JobState>${job.state}</pwg:JobState>
  <scan:ImagesToTransfer>${job.imagesAvailable}</scan:ImagesToTransfer>
</scan:Job>`)
})

app.get('/eSCL/ScanJobs/:jobId/NextDocument', (req, res) => {
  const job = scanJobs.get(req.params.jobId)
  if (!job) {
    return res.status(404).send('Job not found')
  }

  if (job.state !== 'Completed') {
    return res.status(503).send('Job not ready')
  }

  const doc = job.document
  res.set('Content-Type', doc.type)
  res.set('Content-Disposition', `attachment; filename="${doc.name}"`)
  res.send(doc.content)

  job.imagesAvailable = 0
})

app.delete('/eSCL/ScanJobs/:jobId', (req, res) => {
  scanJobs.delete(req.params.jobId)
  res.status(204).send('')
})

app.post('/api/scan', async (req, res) => {
  try {
    const { format = 'pdf', resolution = 300, colorMode = 'RGB24', source = 'Platen' } = req.body || {}
    
    const jobId = uuidv4()
    const sampleDoc = sampleDocuments[Math.floor(Math.random() * sampleDocuments.length)]
    
    const scannedDoc = {
      id: jobId,
      fileName: `scan_${Date.now()}_${sampleDoc.name}`,
      fileType: sampleDoc.type,
      fileSize: sampleDoc.content.length,
      content: sampleDoc.content.toString('base64'),
      scanSettings: { format, resolution, colorMode, source },
      scannedAt: new Date().toISOString(),
      scanner: {
        name: SCANNER_NAME,
        model: SCANNER_MODEL,
        serial: SCANNER_SERIAL,
      },
    }

    res.json(scannedDoc)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/documents', (_req, res) => {
  res.json({
    documents: sampleDocuments.map(d => ({
      id: d.id,
      name: d.name,
      type: d.type,
      size: d.content.length,
    })),
    scanner: {
      name: SCANNER_NAME,
      model: SCANNER_MODEL,
      serial: SCANNER_SERIAL,
    },
  })
})

app.get('/api/documents/:id', (req, res) => {
  const doc = sampleDocuments.find(d => d.id === req.params.id)
  if (!doc) {
    return res.status(404).json({ error: 'Document not found' })
  }
  
  res.set('Content-Type', doc.type)
  res.set('Content-Disposition', `attachment; filename="${doc.name}"`)
  res.send(doc.content)
})

app.listen(SCANNER_PORT, '0.0.0.0', () => {
  console.log(`${SCANNER_NAME} (${SCANNER_MODEL}) listening on port ${SCANNER_PORT}`)
  console.log(`eSCL endpoint: http://localhost:${SCANNER_PORT}/eSCL/ScannerCapabilities`)
  console.log(`API endpoint: http://localhost:${SCANNER_PORT}/api/scan`)
})
