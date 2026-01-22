const crypto = require('node:crypto')
const EventEmitter = require('node:events')

const INVOICE_STATUS = {
  PENDING: 'pending',
  OCR: 'ocr',
  DESCRIBED: 'described',
  APPROVED: 'approved',
  BOOKED: 'booked',
  REJECTED: 'rejected',
}

const INVOICE_SOURCE = {
  EMAIL: 'email',
  SCANNER: 'scanner',
  STORAGE: 'storage',
  KSEF: 'ksef',
}

const ALLOWED_INVOICE_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.xml'])

function isXmlString(value) {
  if (typeof value !== 'string') {
    return false
  }
  const s = value.trim()
  return s.startsWith('<?xml') || (s.startsWith('<') && s.includes('</'))
}

function isEmptyInvoiceFile(value) {
  if (!value) {
    return true
  }
  if (Buffer.isBuffer(value)) {
    return value.length === 0
  }
  if (typeof value === 'string') {
    return value.trim().length === 0
  }
  if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
    return value.data.length === 0
  }
  if (Array.isArray(value)) {
    return value.length === 0
  }
  return false
}

function isAllowedInvoiceFileType({ fileName, fileType, file }) {
  const fn = String(fileName || '').toLowerCase()
  const ft = String(fileType || '').toLowerCase()
  const ext = fn ? fn.slice(fn.lastIndexOf('.')) : ''

  if (isXmlString(file)) {
    return true
  }
  if (ext && ALLOWED_INVOICE_EXTENSIONS.has(ext)) {
    return true
  }
  if (ft.includes('pdf') || ft.includes('xml') || ft.startsWith('image/')) {
    return true
  }
  return false
}

class UnifiedInbox extends EventEmitter {
  constructor(options = {}) {
    super()
    this.invoices = new Map()
    this.store = options.store || null
    this._sourceKeyIndex = new Map()
    this._sourceKeyIndexLoaded = false
    this._sourceKeyIndexLoadPromise = null
  }

  generateId() {
    return crypto.randomUUID()
  }

  async addInvoice(source, file, metadata = {}) {
    const incomingSourceKey = metadata?.sourceKey || metadata?.ingestKey || null
    if (incomingSourceKey) {
      const existing = await this._findBySourceKey(String(incomingSourceKey))
      if (existing) {
        return existing
      }
    }

    if (isEmptyInvoiceFile(file)) {
      throw new Error('invoice_file_required')
    }
    if (!isAllowedInvoiceFileType({ fileName: metadata?.fileName, fileType: metadata?.fileType, file })) {
      throw new Error('unsupported_invoice_file_type')
    }

    const id = this.generateId()
    const normalizedLabelIds = Array.isArray(metadata.labelIds)
      ? metadata.labelIds.map((v) => String(v)).map((v) => v.trim()).filter(Boolean)
      : []
    const invoice = {
      id,
      source,
      status: INVOICE_STATUS.PENDING,
      originalFile: file,
      fileName: metadata.fileName || null,
      fileType: metadata.fileType || null,
      fileSize: metadata.fileSize || null,
      sourceKey: metadata.sourceKey || metadata.ingestKey || null,
      sourcePath: metadata.sourcePath || null,
      storageType: metadata.storageType || null,
      storageProviderId: metadata.storageProviderId || null,
      storageId: metadata.storageId || null,
      remoteUrl: metadata.remoteUrl || null,
      emailSubject: metadata.emailSubject || null,
      emailFrom: metadata.emailFrom || null,
      emailDate: metadata.emailDate || null,
      ksefId: metadata.ksefId || null,
      ksefReferenceNumber: metadata.ksefReferenceNumber || null,
      contractorNip: metadata.contractorNip || null,
      contractorName: metadata.contractorName || null,
      invoiceNumber: metadata.invoiceNumber || null,
      issueDate: metadata.issueDate || null,
      grossAmount: metadata.grossAmount || null,
      netAmount: metadata.netAmount || null,
      vatAmount: metadata.vatAmount || null,
      currency: metadata.currency || 'PLN',
      projectId: metadata.projectId || null,
      expenseTypeId: metadata.expenseTypeId || null,
      labelIds: normalizedLabelIds,
      ocrData: null,
      parsedData: null,
      description: null,
      category: null,
      mpk: null,
      suggestion: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      processedAt: null,
      approvedAt: null,
      bookedAt: null,
    }

    this.invoices.set(id, invoice)

    if (invoice.sourceKey) {
      this._sourceKeyIndex.set(String(invoice.sourceKey), invoice.id)
    }

    if (this.store) {
      await this.store.save(invoice)
    }

    this.emit('invoice:added', invoice)
    return invoice
  }

  async _ensureSourceKeyIndexLoaded() {
    if (this._sourceKeyIndexLoaded) {
      return
    }

    if (this._sourceKeyIndexLoadPromise) {
      await this._sourceKeyIndexLoadPromise
      return
    }

    this._sourceKeyIndexLoadPromise = this._loadSourceKeyIndex()
    await this._sourceKeyIndexLoadPromise
    this._sourceKeyIndexLoadPromise = null
  }

  async _loadSourceKeyIndex() {

    if (this.store) {
      const all = await this.store.list()
      for (const inv of all) {
        if (inv && inv.sourceKey) {
          this._sourceKeyIndex.set(String(inv.sourceKey), String(inv.id))
        }
      }
    } else {
      for (const inv of this.invoices.values()) {
        if (inv && inv.sourceKey) {
          this._sourceKeyIndex.set(String(inv.sourceKey), String(inv.id))
        }
      }
    }

    this._sourceKeyIndexLoaded = true
  }

  async _findBySourceKey(sourceKey) {
    const needle = String(sourceKey)
    await this._ensureSourceKeyIndexLoaded()
    const id = this._sourceKeyIndex.get(needle)
    if (!id) {
      return null
    }
    return this.getInvoice(id)
  }

  async getInvoiceBySourceKey(sourceKey) {
    if (!sourceKey) {
      return null
    }
    return this._findBySourceKey(String(sourceKey))
  }

  async getInvoice(id) {
    if (this.store) {
      return this.store.get(id)
    }
    return this.invoices.get(id) || null
  }

  async updateInvoice(id, updates) {
    const invoice = await this.getInvoice(id)
    if (!invoice) {
      throw new Error(`Invoice ${id} not found`)
    }

    const prevSourceKey = invoice.sourceKey ? String(invoice.sourceKey) : null

    const updated = {
      ...invoice,
      ...updates,
      updatedAt: new Date().toISOString(),
    }

    this.invoices.set(id, updated)

    const nextSourceKey = updated.sourceKey ? String(updated.sourceKey) : null
    if (prevSourceKey && prevSourceKey !== nextSourceKey) {
      this._sourceKeyIndex.delete(prevSourceKey)
    }
    if (nextSourceKey) {
      this._sourceKeyIndex.set(nextSourceKey, String(updated.id))
    }

    if (this.store) {
      await this.store.save(updated)
    }

    this.emit('invoice:updated', updated)
    return updated
  }

  async setStatus(id, status) {
    const timestamps = {}
    if (status === INVOICE_STATUS.DESCRIBED) {
      timestamps.processedAt = new Date().toISOString()
    } else if (status === INVOICE_STATUS.APPROVED) {
      timestamps.approvedAt = new Date().toISOString()
    } else if (status === INVOICE_STATUS.BOOKED) {
      timestamps.bookedAt = new Date().toISOString()
    }

    const invoice = await this.updateInvoice(id, { status, ...timestamps })
    this.emit(`invoice:${status}`, invoice)
    return invoice
  }

  async listInvoices(filter = {}) {
    let invoices = []

    if (this.store) {
      invoices = await this.store.list(filter)
    } else {
      invoices = Array.from(this.invoices.values())
    }

    if (filter.status) {
      invoices = invoices.filter((inv) => inv.status === filter.status)
    }
    if (filter.source) {
      invoices = invoices.filter((inv) => inv.source === filter.source)
    }
    if (filter.since) {
      const since = new Date(filter.since).getTime()
      invoices = invoices.filter((inv) => new Date(inv.createdAt).getTime() >= since)
    }

    return invoices
  }

  async getPendingCount() {
    const pending = await this.listInvoices({ status: INVOICE_STATUS.PENDING })
    const ocr = await this.listInvoices({ status: INVOICE_STATUS.OCR })
    return pending.length + ocr.length
  }

  async getStats() {
    const all = await this.listInvoices()
    const stats = {
      total: all.length,
      byStatus: {},
      bySource: {},
    }

    for (const inv of all) {
      stats.byStatus[inv.status] = (stats.byStatus[inv.status] || 0) + 1
      stats.bySource[inv.source] = (stats.bySource[inv.source] || 0) + 1
    }

    return stats
  }

  async deleteInvoice(id) {
    const invoice = await this.getInvoice(id)
    if (!invoice) {
      return false
    }

    this.invoices.delete(id)

    if (invoice.sourceKey) {
      this._sourceKeyIndex.delete(String(invoice.sourceKey))
    }

    if (this.store) {
      await this.store.delete(id)
    }

    this.emit('invoice:deleted', invoice)
    return true
  }
}

function createUnifiedInbox(options = {}) {
  return new UnifiedInbox(options)
}

module.exports = {
  UnifiedInbox,
  createUnifiedInbox,
  INVOICE_STATUS,
  INVOICE_SOURCE,
}
