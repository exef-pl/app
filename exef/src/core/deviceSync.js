const { EventEmitter } = require('events')

const DEVICE_TYPES = {
  SCANNER: 'scanner',
  PRINTER: 'printer',
}

class DeviceSync extends EventEmitter {
  constructor(options = {}) {
    super()
    this.inbox = options.inbox || null
    this.scanners = []
    this.printers = []
    this.scanInterval = options.scanInterval || 60000
    this._scanTimer = null
    this._state = {}
  }

  configure({ scanners = [], printers = [] }) {
    this.scanners = scanners.map((s, i) => ({
      id: s.id || `scanner-${i + 1}`,
      name: s.name || `Scanner ${i + 1}`,
      type: DEVICE_TYPES.SCANNER,
      protocol: s.protocol || 'escl',
      apiUrl: s.apiUrl || s.url || null,
      enabled: s.enabled !== false,
      ...s,
    }))

    this.printers = printers.map((p, i) => ({
      id: p.id || `printer-${i + 1}`,
      name: p.name || `Printer ${i + 1}`,
      type: DEVICE_TYPES.PRINTER,
      protocol: p.protocol || 'ipp',
      apiUrl: p.apiUrl || p.url || null,
      enabled: p.enabled !== false,
      ...p,
    }))

    this.emit('configured', { scanners: this.scanners.length, printers: this.printers.length })
  }

  setState(state) {
    this._state = state || {}
  }

  getState() {
    return { ...this._state }
  }

  start() {
    if (this._scanTimer) {
      return
    }
    this._scanTimer = setInterval(() => this._pollScanners(), this.scanInterval)
    this.emit('started')
  }

  stop() {
    if (this._scanTimer) {
      clearInterval(this._scanTimer)
      this._scanTimer = null
    }
    this.emit('stopped')
  }

  async _pollScanners() {
    for (const scanner of this.scanners) {
      if (!scanner.enabled || !scanner.apiUrl) continue
      try {
        await this._checkScannerForDocuments(scanner)
      } catch (err) {
        this.emit('error', { device: scanner, error: err })
      }
    }
  }

  async _checkScannerForDocuments(scanner) {
    const apiUrl = scanner.apiUrl.replace(/\/$/, '')
    const res = await fetch(`${apiUrl}/api/documents`)
    if (!res.ok) {
      throw new Error(`Scanner ${scanner.name} documents check failed: ${res.status}`)
    }
    const data = await res.json()
    this.emit('scanner:documents', { scanner, documents: data.documents || [] })
  }

  async getScannerStatus(scannerId) {
    const scanner = this.scanners.find(s => s.id === scannerId)
    if (!scanner || !scanner.apiUrl) {
      return { error: 'Scanner not found or not configured' }
    }

    try {
      const apiUrl = scanner.apiUrl.replace(/\/$/, '')
      const res = await fetch(`${apiUrl}/health`)
      if (!res.ok) {
        return { status: 'offline', error: `HTTP ${res.status}` }
      }
      const data = await res.json()
      return { status: 'online', ...data }
    } catch (err) {
      return { status: 'offline', error: err.message }
    }
  }

  async scanDocument(scannerId, options = {}) {
    const scanner = this.scanners.find(s => s.id === scannerId)
    if (!scanner || !scanner.apiUrl) {
      throw new Error('Scanner not found or not configured')
    }

    const apiUrl = scanner.apiUrl.replace(/\/$/, '')
    const { format = 'pdf', resolution = 300, colorMode = 'RGB24', source = 'Platen' } = options

    const res = await fetch(`${apiUrl}/api/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format, resolution, colorMode, source }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`Scan failed: ${res.status} ${errText}`)
    }

    const scanResult = await res.json()

    if (this.inbox && scanResult.content) {
      const content = Buffer.from(scanResult.content, 'base64')
      const invoice = await this.inbox.addInvoice('scanner', content, {
        fileName: scanResult.fileName,
        fileType: scanResult.fileType,
        fileSize: content.length,
        sourceKey: `scanner:${scanner.id}:${scanResult.id}`,
        scannerName: scanner.name,
        scannerModel: scanResult.scanner?.model,
        scannedAt: scanResult.scannedAt,
      })
      this.emit('scanner:scanned', { scanner, invoice, scanResult })
      return { invoice, scanResult }
    }

    this.emit('scanner:scanned', { scanner, scanResult })
    return { scanResult }
  }

  async listScannerDocuments(scannerId) {
    const scanner = this.scanners.find(s => s.id === scannerId)
    if (!scanner || !scanner.apiUrl) {
      throw new Error('Scanner not found or not configured')
    }

    const apiUrl = scanner.apiUrl.replace(/\/$/, '')
    const res = await fetch(`${apiUrl}/api/documents`)
    if (!res.ok) {
      throw new Error(`Failed to list documents: ${res.status}`)
    }

    const data = await res.json()
    return data.documents || []
  }

  async getPrinterStatus(printerId) {
    const printer = this.printers.find(p => p.id === printerId)
    if (!printer || !printer.apiUrl) {
      return { error: 'Printer not found or not configured' }
    }

    try {
      const apiUrl = printer.apiUrl.replace(/\/$/, '')
      const res = await fetch(`${apiUrl}/health`)
      if (!res.ok) {
        return { status: 'offline', error: `HTTP ${res.status}` }
      }
      const data = await res.json()
      return { status: 'online', ...data }
    } catch (err) {
      return { status: 'offline', error: err.message }
    }
  }

  async getPrinterInfo(printerId) {
    const printer = this.printers.find(p => p.id === printerId)
    if (!printer || !printer.apiUrl) {
      throw new Error('Printer not found or not configured')
    }

    const apiUrl = printer.apiUrl.replace(/\/$/, '')
    const res = await fetch(`${apiUrl}/api/printer`)
    if (!res.ok) {
      throw new Error(`Failed to get printer info: ${res.status}`)
    }

    return res.json()
  }

  async printDocument(printerId, document, options = {}) {
    const printer = this.printers.find(p => p.id === printerId)
    if (!printer || !printer.apiUrl) {
      throw new Error('Printer not found or not configured')
    }

    const apiUrl = printer.apiUrl.replace(/\/$/, '')
    const { copies = 1, duplex = false, colorMode = 'color', paperSize = 'A4' } = options

    const printDoc = {
      fileName: document.fileName || 'document.pdf',
      fileType: document.fileType || 'application/pdf',
      content: Buffer.isBuffer(document.content)
        ? document.content.toString('base64')
        : document.content,
    }

    const res = await fetch(`${apiUrl}/api/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: printDoc, copies, duplex, colorMode, paperSize }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`Print failed: ${res.status} ${errText}`)
    }

    const result = await res.json()
    this.emit('printer:printed', { printer, jobId: result.jobId, document: printDoc })
    return result
  }

  async getPrintJobs(printerId) {
    const printer = this.printers.find(p => p.id === printerId)
    if (!printer || !printer.apiUrl) {
      throw new Error('Printer not found or not configured')
    }

    const apiUrl = printer.apiUrl.replace(/\/$/, '')
    const res = await fetch(`${apiUrl}/api/jobs`)
    if (!res.ok) {
      throw new Error(`Failed to get print jobs: ${res.status}`)
    }

    const data = await res.json()
    return data.jobs || []
  }

  async getPrintJobStatus(printerId, jobId) {
    const printer = this.printers.find(p => p.id === printerId)
    if (!printer || !printer.apiUrl) {
      throw new Error('Printer not found or not configured')
    }

    const apiUrl = printer.apiUrl.replace(/\/$/, '')
    const res = await fetch(`${apiUrl}/api/jobs/${jobId}`)
    if (!res.ok) {
      throw new Error(`Failed to get job status: ${res.status}`)
    }

    return res.json()
  }

  async cancelPrintJob(printerId, jobId) {
    const printer = this.printers.find(p => p.id === printerId)
    if (!printer || !printer.apiUrl) {
      throw new Error('Printer not found or not configured')
    }

    const apiUrl = printer.apiUrl.replace(/\/$/, '')
    const res = await fetch(`${apiUrl}/api/jobs/${jobId}/cancel`, { method: 'POST' })
    if (!res.ok) {
      throw new Error(`Failed to cancel job: ${res.status}`)
    }

    const result = await res.json()
    this.emit('printer:cancelled', { printer, jobId })
    return result
  }

  async getAllDevicesStatus() {
    const scannerStatuses = await Promise.all(
      this.scanners.map(async (s) => ({
        ...s,
        ...(await this.getScannerStatus(s.id)),
      }))
    )

    const printerStatuses = await Promise.all(
      this.printers.map(async (p) => ({
        ...p,
        ...(await this.getPrinterStatus(p.id)),
      }))
    )

    return { scanners: scannerStatuses, printers: printerStatuses }
  }
}

module.exports = { DeviceSync, DEVICE_TYPES }
