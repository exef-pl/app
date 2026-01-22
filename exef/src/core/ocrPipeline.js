const EventEmitter = require('node:events')
const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const OCR_PROVIDERS = {
  TESSERACT: 'tesseract',
  GOOGLE_VISION: 'google-vision',
  AZURE_OCR: 'azure-ocr',
  EXTERNAL_API: 'external-api',
}

const EXTERNAL_OCR_API_PRESETS = {
  exef_pro: {
    name: 'EXEF Pro (self-hosted)',
    url: 'http://127.0.0.1:8095/ocr',
    method: 'POST',
  },
  google_vision_v1_images_annotate: {
    name: 'Google Cloud Vision API',
    url: 'https://vision.googleapis.com/v1/images:annotate',
    method: 'POST',
    auth: 'google-api-key',
  },
  azure_computer_vision_read: {
    name: 'Azure AI Vision (Read)',
    url: 'https://{endpoint}/vision/v3.2/read/analyze',
    method: 'POST',
    auth: 'azure-key',
  },
  ocr_space_parse_image: {
    name: 'OCR.Space',
    url: 'https://api.ocr.space/parse/image',
    method: 'POST',
    auth: 'api-key',
  },
  mindee_ocr: {
    name: 'Mindee OCR',
    url: 'https://api.mindee.net/v1/products/mindee/ocr/v1/predict',
    method: 'POST',
    auth: 'bearer',
  },
  nanonets_ocr: {
    name: 'Nanonets OCR',
    url: 'https://app.nanonets.com/api/v2/OCR/Model/{modelId}/LabelUrls/',
    method: 'POST',
    auth: 'basic',
  },
  abbyy_cloud_ocr: {
    name: 'ABBYY Cloud OCR SDK',
    url: 'https://cloud.ocrsdk.com/processImage',
    method: 'POST',
    auth: 'basic',
  },
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

    this.pdf = {
      pdftoppmBinary: options.pdf?.pdftoppmBinary || 'pdftoppm',
      dpi: options.pdf?.dpi ?? 200,
      timeoutMs: options.pdf?.timeoutMs ?? 120000,
      maxPages: options.pdf?.maxPages ?? 30,
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
    const safe = String(xml || '')

    const extractSection = (tag) => {
      const t = String(tag)
      const re = new RegExp(
        `<(?:[\\w-]+:)?${t}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${t}>`,
        'i'
      )
      const m = safe.match(re)
      return m ? String(m[1] || '') : ''
    }

    const get = (tag, fromXml) => {
      const t = String(tag)
      const src = fromXml != null ? String(fromXml) : safe
      const re = new RegExp(
        `<(?:[\\w-]+:)?${t}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${t}>`,
        'i'
      )
      const m = src.match(re)
      if (!m) {
        return null
      }
      const raw = String(m[1] || '')
      const text = raw.replace(/<[^>]+>/g, '').trim()
      return text || null
    }

    const getAmount = (tag, fromXml) => {
      const val = get(tag, fromXml)
      if (!val) {
        return null
      }
      const normalized = String(val).replace(/\s/g, '').replace(',', '.')
      const n = parseFloat(normalized)
      return Number.isFinite(n) ? n : null
    }

    const fa = extractSection('Fa') || safe
    const podmiot1 = extractSection('Podmiot1') || safe
    const podmiot2 = extractSection('Podmiot2') || safe

    return {
      invoiceNumber: get('P_2', fa) || get('NrFaktury', fa) || get('InvoiceNumber', fa) || get('P_2') || get('NrFaktury') || get('InvoiceNumber'),
      issueDate: get('P_1', fa) || get('DataWystawienia', fa) || get('IssueDate', fa) || get('P_1') || get('DataWystawienia') || get('IssueDate'),
      dueDate: get('TerminPlatnosci', fa) || get('DueDate', fa) || get('TerminPlatnosci') || get('DueDate'),
      sellerNip: get('NIP', podmiot1) || get('SellerNIP') || get('NIP'),
      sellerName: get('Nazwa', podmiot1) || get('SellerName') || get('Nazwa'),
      buyerNip: get('NIP', podmiot2) || get('BuyerNIP') || get('NIPNabywcy'),
      buyerName: get('Nazwa', podmiot2) || get('BuyerName') || get('NazwaNabywcy'),
      netAmount: getAmount('P_13_1', fa) || getAmount('WartoscNetto', fa) || getAmount('P_13_1') || getAmount('WartoscNetto'),
      vatAmount: getAmount('P_14_1', fa) || getAmount('KwotaVAT', fa) || getAmount('P_14_1') || getAmount('KwotaVAT'),
      grossAmount: getAmount('P_15', fa) || getAmount('WartoscBrutto', fa) || getAmount('P_15') || getAmount('WartoscBrutto'),
      currency: get('KodWaluty', fa) || get('KodWaluty') || 'PLN',
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
      if (this._isPdf({ fileType, fileName })) {
        try {
          ocrResult = await this._runTesseract(fileBuffer, fileType)
        } catch (err) {
          ocrResult = await this._runTesseractPdfFallback({ fileBuffer, fileType, fileName, originalError: err })
        }
      } else {
        ocrResult = await this._runTesseract(fileBuffer, fileType)
      }
    } else if (this.provider === OCR_PROVIDERS.GOOGLE_VISION) {
      ocrResult = await this._runGoogleVision(fileBuffer)
    } else if (this.provider === OCR_PROVIDERS.AZURE_OCR) {
      ocrResult = await this._runAzureOcr(fileBuffer)
    } else if (this.provider === OCR_PROVIDERS.EXTERNAL_API) {
      ocrResult = await this._runExternalApiOcr({ fileBuffer, fileType, fileName })
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

  _isPdf({ fileType, fileName } = {}) {
    const ft = String(fileType || '').toLowerCase()
    const fn = String(fileName || '').toLowerCase()
    return ft.includes('pdf') || fn.endsWith('.pdf')
  }

  async _runTesseractPdfFallback({ fileBuffer, fileType, fileName, originalError }) {
    this.emit('tesseract:pdf_fallback', {
      size: fileBuffer?.length || 0,
      fileType,
      fileName,
      error: originalError?.message || String(originalError || ''),
    })

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'exef-ocr-pdf-'))
    const inputPdf = path.join(dir, 'input.pdf')
    const outPrefix = path.join(dir, 'page')

    try {
      await fs.writeFile(inputPdf, fileBuffer)

      const args = ['-png', '-r', String(this.pdf.dpi), inputPdf, outPrefix]
      const { stderr, exitCode } = await this._spawnCapture(this.pdf.pdftoppmBinary, args, this.pdf.timeoutMs)

      if (exitCode !== 0) {
        const msg = (stderr || '').trim()
        throw new Error(`PDF conversion failed${msg ? `: ${msg}` : ''}`)
      }

      const entries = await fs.readdir(dir)
      const pages = entries
        .filter((n) => n.startsWith('page-') && n.toLowerCase().endsWith('.png'))
        .sort((a, b) => {
          const na = Number((a.match(/page-(\d+)/) || [])[1] || 0)
          const nb = Number((b.match(/page-(\d+)/) || [])[1] || 0)
          return na - nb
        })

      if (!pages.length) {
        throw new Error('PDF conversion produced no pages')
      }

      const limited = pages.slice(0, Math.max(1, Number(this.pdf.maxPages) || 30))
      const texts = []

      for (const p of limited) {
        const buf = await fs.readFile(path.join(dir, p))
        const pageResult = await this._runTesseract(buf, 'image/png')
        if (pageResult?.text) {
          texts.push(pageResult.text)
        }
      }

      return {
        text: texts.join('\n').trim(),
        confidence: null,
      }
    } catch (e) {
      if (e && e.code === 'ENOENT') {
        throw new Error('PDF conversion tool not found. Install `poppler-utils` (pdftoppm) or configure a supported PDF renderer.')
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
    const apiUrl = this.apiConfig?.googleVisionApiUrl || 'https://vision.googleapis.com/v1/images:annotate'
    const apiKey = this.apiConfig?.googleVisionKey
    const timeoutMs = Math.max(1000, Number(this.apiConfig?.googleVisionTimeoutMs) || 60000)

    if (!apiKey) {
      throw new Error('Google Vision API key not configured')
    }

    const url = apiUrl.includes('?')
      ? `${apiUrl}&key=${encodeURIComponent(String(apiKey))}`
      : `${apiUrl}?key=${encodeURIComponent(String(apiKey))}`

    this.emit('google-vision:run', { size: fileBuffer.length, url: apiUrl })

    const controller = new AbortController()
    const timer = setTimeout(() => {
      try {
        controller.abort()
      } catch (_e) {
      }
    }, timeoutMs)

    try {
      const body = {
        requests: [
          {
            image: { content: Buffer.from(fileBuffer).toString('base64') },
            features: [{ type: 'TEXT_DETECTION' }],
          },
        ],
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      const json = await res.json().catch(() => null)
      if (!res.ok) {
        const msg = json && typeof json === 'object'
          ? (json.error?.message || json.error?.status || JSON.stringify(json))
          : String(json || '')
        throw new Error(`Google Vision API request failed: ${res.status}${msg ? `: ${msg}` : ''}`)
      }

      const text =
        json?.responses?.[0]?.fullTextAnnotation?.text ||
        json?.responses?.[0]?.textAnnotations?.[0]?.description ||
        ''

      return {
        text: String(text || '').trim(),
        confidence: null,
      }
    } catch (e) {
      if (e && String(e.name || '') === 'AbortError') {
        throw new Error('Google Vision API request timed out')
      }
      throw e
    } finally {
      clearTimeout(timer)
    }
  }

  async _runExternalApiOcr({ fileBuffer, fileType, fileName }) {
    const presetKey = this.apiConfig?.externalPreset || this.apiConfig?.preset || null
    const presetUrl = presetKey && EXTERNAL_OCR_API_PRESETS[presetKey]
      ? EXTERNAL_OCR_API_PRESETS[presetKey].url
      : null

    const url = String(this.apiConfig?.externalUrl || this.apiConfig?.url || presetUrl || '').trim()
    if (!url) {
      throw new Error('External OCR URL not configured')
    }

    if (url.toLowerCase().startsWith('mock://')) {
      return {
        text: String(this.apiConfig?.mockText || ''),
        confidence: 0,
      }
    }

    const timeoutMs = Number(this.apiConfig?.timeoutMs) || 60000
    const headers = this.apiConfig?.headers && typeof this.apiConfig.headers === 'object'
      ? { ...this.apiConfig.headers }
      : {}

    headers['Content-Type'] = headers['Content-Type'] || 'application/json'

    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs))

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          base64: fileBuffer.toString('base64'),
          fileType: fileType || null,
          fileName: fileName || null,
        }),
        signal: controller.signal,
      })

      const json = await res.json().catch(() => null)
      if (!res.ok) {
        const msg = json && (json.error || json.message) ? String(json.error || json.message) : null
        throw new Error(`External OCR request failed: ${res.status}${msg ? `: ${msg}` : ''}`)
      }

      const text = json?.text ?? json?.rawText ?? null
      return {
        text: text ? String(text) : '',
        confidence: json?.confidence ?? null,
      }
    } finally {
      clearTimeout(t)
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
  EXTERNAL_OCR_API_PRESETS,
}
