const EventEmitter = require('node:events')
const fs = require('node:fs')

const EXPORT_FORMATS = {
  CSV: 'csv',
  XLSX: 'xlsx',
  JSON: 'json',
  WFIRMA: 'wfirma',
}

class ExportService extends EventEmitter {
  constructor(options = {}) {
    super()
    this.wfirmaConfig = options.wfirmaConfig || null
    this.webhookUrl = options.webhookUrl || null
  }

  async exportInvoices(invoices, format, options = {}) {
    this.emit('exporting', { count: invoices.length, format })

    let result

    switch (format) {
      case EXPORT_FORMATS.CSV:
        result = await this.toCsv(invoices, options)
        break
      case EXPORT_FORMATS.XLSX:
        result = await this.toXlsx(invoices, options)
        break
      case EXPORT_FORMATS.JSON:
        result = await this.toJson(invoices, options)
        break
      case EXPORT_FORMATS.WFIRMA:
        result = await this.toWfirma(invoices, options)
        break
      default:
        throw new Error(`Unknown export format: ${format}`)
    }

    this.emit('exported', { count: invoices.length, format, result })
    return result
  }

  async toCsv(invoices, options = {}) {
    const separator = options.separator || ';'
    const headers = [
      'ID',
      'Nr faktury',
      'Data wystawienia',
      'NIP kontrahenta',
      'Nazwa kontrahenta',
      'Netto',
      'VAT',
      'Brutto',
      'Waluta',
      'Kategoria',
      'MPK',
      'Opis',
      'Status',
      'Zrodlo',
      'KSeF ID',
    ]

    const rows = [headers.join(separator)]

    for (const inv of invoices) {
      const row = [
        inv.id || '',
        inv.invoiceNumber || '',
        inv.issueDate || '',
        inv.contractorNip || inv.sellerNip || '',
        inv.contractorName || inv.sellerName || '',
        inv.netAmount ?? '',
        inv.vatAmount ?? '',
        inv.grossAmount ?? '',
        inv.currency || 'PLN',
        inv.category || '',
        inv.mpk || '',
        inv.description || '',
        inv.status || '',
        inv.source || '',
        inv.ksefReferenceNumber || inv.ksefId || '',
      ]
      rows.push(row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(separator))
    }

    const csv = rows.join('\n')

    if (options.filePath) {
      fs.writeFileSync(options.filePath, '\uFEFF' + csv, 'utf8')
      return { filePath: options.filePath, size: csv.length }
    }

    return { content: csv, mimeType: 'text/csv' }
  }

  async toXlsx(invoices, options = {}) {
    // Placeholder - requires xlsx library
    // const XLSX = require('xlsx')
    // const ws = XLSX.utils.json_to_sheet(invoices)
    // const wb = XLSX.utils.book_new()
    // XLSX.utils.book_append_sheet(wb, ws, 'Faktury')
    // XLSX.writeFile(wb, options.filePath)

    this.emit('xlsx:generate', { count: invoices.length })

    return {
      error: 'XLSX export requires xlsx library. Use CSV for now.',
      fallback: await this.toCsv(invoices, options),
    }
  }

  async toJson(invoices, options = {}) {
    const json = JSON.stringify(invoices, null, 2)

    if (options.filePath) {
      fs.writeFileSync(options.filePath, json, 'utf8')
      return { filePath: options.filePath, size: json.length }
    }

    return { content: json, mimeType: 'application/json' }
  }

  async toWfirma(invoices, options = {}) {
    if (!this.wfirmaConfig) {
      throw new Error('wFirma API not configured')
    }

    const results = []

    for (const inv of invoices) {
      const result = await this._sendToWfirma(inv)
      results.push(result)
    }

    return {
      sent: results.length,
      results,
    }
  }

  async _sendToWfirma(invoice) {
    const { apiKey, companyId, baseUrl } = this.wfirmaConfig

    const url = baseUrl || 'https://api2.wfirma.pl'
    const endpoint = `${url}/${companyId}/invoices/add`

    // Placeholder - actual wFirma API integration
    // Would map invoice fields to wFirma format and POST

    this.emit('wfirma:send', { invoiceId: invoice.id })

    return {
      invoiceId: invoice.id,
      status: 'pending',
      message: 'wFirma integration placeholder - configure API key',
    }
  }

  async sendWebhook(invoices, webhookUrl) {
    const url = webhookUrl || this.webhookUrl
    if (!url) {
      throw new Error('Webhook URL not configured')
    }

    const payload = {
      event: 'invoices.exported',
      timestamp: new Date().toISOString(),
      count: invoices.length,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        contractorNip: inv.contractorNip || inv.sellerNip,
        grossAmount: inv.grossAmount,
        status: inv.status,
        category: inv.category,
      })),
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Webhook failed: ${res.status} ${text}`)
    }

    this.emit('webhook:sent', { url, count: invoices.length })

    return { success: true, statusCode: res.status }
  }

  async generateAccountantLink(invoices, options = {}) {
    const token = require('node:crypto').randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + (options.expiryDays || 7) * 24 * 60 * 60 * 1000)

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      invoiceCount: invoices.length,
      url: `${options.baseUrl || 'https://exef.pl'}/share/${token}`,
    }
  }

  setWfirmaConfig(config) {
    this.wfirmaConfig = {
      apiKey: config.apiKey,
      companyId: config.companyId,
      baseUrl: config.baseUrl || 'https://api2.wfirma.pl',
    }
  }

  setWebhookUrl(url) {
    this.webhookUrl = url
  }
}

function createExportService(options = {}) {
  return new ExportService(options)
}

module.exports = {
  ExportService,
  createExportService,
  EXPORT_FORMATS,
}
