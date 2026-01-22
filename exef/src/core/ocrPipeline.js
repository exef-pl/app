const EventEmitter = require('node:events')
const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const OCR_PROVIDERS = {
  TESSERACT: 'tesseract',
  GOOGLE_VISION: 'google-vision',
  AZURE_OCR: 'azure-ocr',
}

class OcrPipeline extends EventEmitter {
  constructor(options = {}) {
    super()
    this.provider = options.provider || OCR_PROVIDERS.TESSERACT
    this.apiConfig = options.apiConfig || null
    this.ksefParser = options.ksefParser || null
    this.tesseract = {
      binary: options.tesseract?.binary || 'tesseract',
      lang: options.tesseract?.lang || 'pol',
      psm: options.tesseract?.psm ?? 3,
      oem: options.tesseract?.oem ?? 1,
      timeoutMs: options.tesseract?.timeoutMs ?? 60000,
    }
  }

  async process(invoice) {
    this.emit('processing', { id: invoice.id, source: invoice.source })

    try {
      let result

      if (invoice.source === 'ksef') {
        result = await this.parseKsefXml(invoice)
      } else {
        result = await this.runOcr(invoice)
      }

      this.emit('processed', { id: invoice.id, result })
      return result
    } catch (err) {
      this.emit('error', { id: invoice.id, error: err })
      throw err
    }
  }

  async parseKsefXml(invoice) {
    const xmlContent =
      typeof invoice.originalFile === 'string'
        ? invoice.originalFile
        : invoice.originalFile?.toString('utf8')

    if (!xmlContent) {
      throw new Error('No XML content to parse')
    }

    const extracted = this._extractFromKsefXml(xmlContent)

    return {
      source: 'ksef',
      confidence: 100,
      rawText: null,
      invoiceNumber: extracted.invoiceNumber,
      issueDate: extracted.issueDate,
      dueDate: extracted.dueDate,
      sellerNip: extracted.sellerNip,
      sellerName: extracted.sellerName,
      buyerNip: extracted.buyerNip,
      buyerName: extracted.buyerName,
      netAmount: extracted.netAmount,
      vatAmount: extracted.vatAmount,
      grossAmount: extracted.grossAmount,
      currency: extracted.currency,
      items: extracted.items,
    }
  }

  _extractFromKsefXml(xml) {
    const get = (tag) => {
      const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'))
      return match ? match[1].trim() : null
    }

    const getAmount = (tag) => {
      const val = get(tag)
      return val ? parseFloat(val) : null
    }

    return {
      invoiceNumber: get('P_2') || get('NrFaktury') || get('InvoiceNumber'),
      issueDate: get('P_1') || get('DataWystawienia') || get('IssueDate'),
      dueDate: get('TerminPlatnosci') || get('DueDate'),
      sellerNip: get('NIP') || get('SellerNIP'),
      sellerName: get('Nazwa') || get('SellerName'),
      buyerNip: get('NIPNabywcy') || get('BuyerNIP'),
      buyerName: get('NazwaNabywcy') || get('BuyerName'),
      netAmount: getAmount('P_13_1') || getAmount('WartoscNetto'),
      vatAmount: getAmount('P_14_1') || getAmount('KwotaVAT'),
      grossAmount: getAmount('P_15') || getAmount('WartoscBrutto'),
      currency: get('KodWaluty') || 'PLN',
      items: [],
    }
  }

  async runOcr(invoice) {
    const fileType = invoice.fileType || ''
    const fileName = invoice.fileName || ''
    const fileBuffer = this._normalizeFileContent(invoice.originalFile, { fileType, fileName })

    if (this._shouldParseXml({ fileType, fileName, fileBuffer })) {
      const xmlContent =
        typeof invoice.originalFile === 'string'
          ? invoice.originalFile
          : fileBuffer?.toString('utf8')
      const extracted = this._extractFromKsefXml(xmlContent || '')
      return {
        source: invoice.source,
        confidence: 100,
        rawText: null,
        invoiceNumber: extracted.invoiceNumber,
        issueDate: extracted.issueDate,
        dueDate: extracted.dueDate,
        sellerNip: extracted.sellerNip,
        sellerName: extracted.sellerName,
        buyerNip: extracted.buyerNip,
        buyerName: extracted.buyerName,
        netAmount: extracted.netAmount,
        vatAmount: extracted.vatAmount,
        grossAmount: extracted.grossAmount,
        currency: extracted.currency,
        items: extracted.items,
      }
    }

    if (!fileBuffer) {
      return {
        source: invoice.source,
        confidence: 0,
        rawText: null,
        invoiceNumber: invoice.invoiceNumber || null,
        issueDate: invoice.issueDate || null,
        sellerNip: invoice.contractorNip || null,
        sellerName: invoice.contractorName || null,
        grossAmount: invoice.grossAmount || null,
        currency: invoice.currency || 'PLN',
        note: 'No file content for OCR - using metadata',
      }
    }

    let ocrResult

    if (this.provider === OCR_PROVIDERS.TESSERACT) {
      ocrResult = await this._runTesseract(fileBuffer, fileType)
    } else if (this.provider === OCR_PROVIDERS.GOOGLE_VISION) {
      ocrResult = await this._runGoogleVision(fileBuffer)
    } else if (this.provider === OCR_PROVIDERS.AZURE_OCR) {
      ocrResult = await this._runAzureOcr(fileBuffer)
    } else {
      throw new Error(`Unknown OCR provider: ${this.provider}`)
    }

    const extracted = this._extractInvoiceData(ocrResult.text)

    return {
      source: invoice.source,
      confidence: ocrResult.confidence,
      rawText: ocrResult.text,
      ...extracted,
    }
  }

  async _runTesseract(fileBuffer, fileType) {
    const ext = this._inferExtension(fileType)

    this.emit('tesseract:run', { size: fileBuffer.length, fileType, ext })

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'exef-ocr-'))
    const inputPath = path.join(dir, `input${ext}`)

    try {
      await fs.writeFile(inputPath, fileBuffer)

      const args = [
        inputPath,
        'stdout',
        '-l',
        this.tesseract.lang,
        '--psm',
        String(this.tesseract.psm),
        '--oem',
        String(this.tesseract.oem),
      ]

      const { stdout, stderr, exitCode } = await this._spawnCapture(
        this.tesseract.binary,
        args,
        this.tesseract.timeoutMs
      )

      if (exitCode !== 0) {
        const hint =
          exitCode === null
            ? ' (timeout)'
            : ''
        const msg = (stderr || '').trim()
        throw new Error(`Tesseract OCR failed${hint}${msg ? `: ${msg}` : ''}`)
      }

      return {
        text: (stdout || '').trim(),
        confidence: null,
      }
    } catch (e) {
      if (e && e.code === 'ENOENT') {
        throw new Error('Tesseract binary not found. Install `tesseract-ocr` and ensure `tesseract` is on PATH.')
      }
      throw e
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  }

  _inferExtension(fileType) {
    const ft = String(fileType || '').toLowerCase()
    if (ft.includes('pdf')) return '.pdf'
    if (ft.includes('png')) return '.png'
    if (ft.includes('jpeg') || ft.includes('jpg')) return '.jpg'
    if (ft.includes('tiff') || ft.includes('tif')) return '.tif'
    return '.bin'
  }

  _normalizeFileContent(value, { fileType, fileName } = {}) {
    if (!value) {
      return null
    }

    if (Buffer.isBuffer(value)) {
      return value
    }

    if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
      return Buffer.from(value.data)
    }

    if (Array.isArray(value) && value.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      return Buffer.from(value)
    }

    if (typeof value === 'string') {
      const trimmed = value.trim()

      if (this._shouldParseXml({ fileType, fileName, fileBuffer: trimmed })) {
        return Buffer.from(trimmed, 'utf8')
      }

      const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.*)$/i)
      if (dataUrlMatch) {
        try {
          return Buffer.from(dataUrlMatch[2], 'base64')
        } catch (_e) {
          return Buffer.from(trimmed, 'utf8')
        }
      }

      const base64Candidate = trimmed.replace(/\s/g, '')
      const looksBase64 =
        base64Candidate.length >= 64 &&
        base64Candidate.length % 4 === 0 &&
        /^[a-z0-9+/]+=*$/i.test(base64Candidate)

      if (looksBase64) {
        try {
          return Buffer.from(base64Candidate, 'base64')
        } catch (_e) {
          return Buffer.from(trimmed, 'utf8')
        }
      }

      return Buffer.from(trimmed, 'utf8')
    }

    return null
  }

  _shouldParseXml({ fileType, fileName, fileBuffer }) {
    const ft = String(fileType || '').toLowerCase()
    const fn = String(fileName || '').toLowerCase()
    if (ft.includes('xml') || fn.endsWith('.xml')) {
      return true
    }
    if (typeof fileBuffer === 'string') {
      const s = fileBuffer.trim()
      return s.startsWith('<?xml') || (s.startsWith('<') && s.includes('</'))
    }
    return false
  }

  _spawnCapture(command, args, timeoutMs) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      let killed = false

      const t = setTimeout(() => {
        killed = true
        try {
          child.kill('SIGKILL')
        } catch (_e) {
        }
      }, Math.max(1000, Number(timeoutMs) || 60000))

      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')

      child.stdout.on('data', (d) => {
        stdout += d
      })
      child.stderr.on('data', (d) => {
        stderr += d
      })

      child.on('error', (err) => {
        clearTimeout(t)
        reject(err)
      })

      child.on('close', (code) => {
        clearTimeout(t)
        resolve({ stdout, stderr, exitCode: killed ? null : code })
      })
    })
  }

  async _runGoogleVision(fileBuffer) {
    if (!this.apiConfig?.googleVisionKey) {
      throw new Error('Google Vision API key not configured')
    }

    // Placeholder - requires @google-cloud/vision
    // const vision = require('@google-cloud/vision')
    // const client = new vision.ImageAnnotatorClient()
    // const [result] = await client.textDetection(fileBuffer)

    this.emit('google-vision:run', { size: fileBuffer.length })

    return {
      text: '',
      confidence: 0,
    }
  }

  async _runAzureOcr(fileBuffer) {
    if (!this.apiConfig?.azureEndpoint || !this.apiConfig?.azureKey) {
      throw new Error('Azure OCR not configured')
    }

    // Placeholder - requires @azure/cognitiveservices-computervision
    // Implementation would call Azure Computer Vision API

    this.emit('azure-ocr:run', { size: fileBuffer.length })

    return {
      text: '',
      confidence: 0,
    }
  }

  _extractInvoiceData(text) {
    if (!text) {
      return {}
    }

    const patterns = {
      invoiceNumber: /(?:faktura|fv|nr|numer)[:\s]*([a-z0-9\-\/]+)/i,
      nip: /(?:nip)[:\s]*(\d{10}|\d{3}-\d{3}-\d{2}-\d{2})/gi,
      date: /(\d{4}-\d{2}-\d{2}|\d{2}[.\/-]\d{2}[.\/-]\d{4})/g,
      amount: /(\d{1,3}(?:[\s,]\d{3})*(?:[.,]\d{2}))\s*(?:pln|zł|zl)?/gi,
    }

    const invoiceNumberMatch = text.match(patterns.invoiceNumber)
    const nipMatches = text.match(patterns.nip) || []
    const dateMatches = text.match(patterns.date) || []
    const amountMatches = text.match(patterns.amount) || []

    const parseAmount = (str) => {
      if (!str) return null
      const normalized = str.replace(/\s/g, '').replace(',', '.')
      return parseFloat(normalized)
    }

    const amounts = amountMatches.map(parseAmount).filter((a) => a && a > 0)
    amounts.sort((a, b) => b - a)

    return {
      invoiceNumber: invoiceNumberMatch ? invoiceNumberMatch[1] : null,
      sellerNip: nipMatches[0]?.replace(/\D/g, '') || null,
      buyerNip: nipMatches[1]?.replace(/\D/g, '') || null,
      issueDate: dateMatches[0] || null,
      dueDate: dateMatches[1] || null,
      grossAmount: amounts[0] || null,
      netAmount: amounts[1] || null,
      vatAmount: amounts[0] && amounts[1] ? amounts[0] - amounts[1] : null,
      currency: 'PLN',
    }
  }

  setProvider(provider) {
    this.provider = provider
  }

  setApiConfig(config) {
    this.apiConfig = config
  }
}

function createOcrPipeline(options = {}) {
  return new OcrPipeline(options)
}

module.exports = {
  OcrPipeline,
  createOcrPipeline,
  OCR_PROVIDERS,
}
