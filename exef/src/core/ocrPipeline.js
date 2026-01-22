const EventEmitter = require('node:events')

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
    const fileBuffer = invoice.originalFile
    const fileType = invoice.fileType || ''

    if (!fileBuffer) {
      throw new Error('No file content for OCR')
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
    // Placeholder - requires tesseract.js
    // const Tesseract = require('tesseract.js')
    // const { data } = await Tesseract.recognize(fileBuffer, 'pol')
    // return { text: data.text, confidence: data.confidence }

    this.emit('tesseract:run', { size: fileBuffer.length })

    return {
      text: '',
      confidence: 0,
    }
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
