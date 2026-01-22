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

class UnifiedInbox extends EventEmitter {
  constructor(options = {}) {
    super()
    this.invoices = new Map()
    this.store = options.store || null
  }

  generateId() {
    return crypto.randomUUID()
  }

  async addInvoice(source, file, metadata = {}) {
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

    if (this.store) {
      await this.store.save(invoice)
    }

    this.emit('invoice:added', invoice)
    return invoice
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

    const updated = {
      ...invoice,
      ...updates,
      updatedAt: new Date().toISOString(),
    }

    this.invoices.set(id, updated)

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
