const EventEmitter = require('node:events')

const { createUnifiedInbox, INVOICE_STATUS, INVOICE_SOURCE } = require('./unifiedInbox')
const { createStore } = require('./draftStore')
const { createEmailWatcher } = require('./emailWatcher')
const { createStorageSync } = require('./storageSync')
const { createOcrPipeline } = require('./ocrPipeline')
const { createAutoDescribeEngine, defaultRules } = require('./autoDescribe')
const { createExportService } = require('./exportService')
const { createKsefFacade } = require('./ksefFacade')

class InvoiceWorkflow extends EventEmitter {
  constructor(options = {}) {
    super()

    this.store = options.store || createStore(options.storeOptions)

    this.inbox = createUnifiedInbox({ store: this.store })

    this.emailWatcher = createEmailWatcher({
      inbox: this.inbox,
      pollInterval: options.emailPollInterval || 300000,
    })

    this.storageSync = createStorageSync({
      inbox: this.inbox,
      watchPaths: options.watchPaths || [],
      connections: Array.isArray(options.storageConnections) ? options.storageConnections : [],
      pollInterval: options.storagePollInterval || 60000,
    })

    this.ocrPipeline = createOcrPipeline(options.ocrOptions)

    this.autoDescribe = createAutoDescribeEngine({
      rules: options.descriptionRules || defaultRules,
    })

    this.exportService = createExportService(options.exportOptions)

    this.ksefFacade = options.ksefFacade || createKsefFacade(options.ksefOptions)

    this.ksefPollInterval = options.ksefPollInterval || 600000
    this.ksefAccessToken = null
    this.ksefLastPoll = null
    this.ksefPollTimer = null

    this._setupEventForwarding()
  }

  _setupEventForwarding() {
    this.inbox.on('invoice:added', (inv) => this.emit('invoice:added', inv))
    this.inbox.on('invoice:updated', (inv) => this.emit('invoice:updated', inv))
    this.emailWatcher.on('invoice:found', (inv) => this.emit('email:invoice', inv))
    this.emailWatcher.on('error', (err) => this.emit('email:error', err))
    this.storageSync.on('invoice:found', (inv) => this.emit('storage:invoice', inv))
    this.storageSync.on('error', (err) => this.emit('storage:error', err))
    this.ocrPipeline.on('processed', (data) => this.emit('ocr:processed', data))
    this.ocrPipeline.on('error', (data) => this.emit('ocr:error', data))
    this.autoDescribe.on('suggested', (data) => this.emit('describe:suggested', data))
  }

  async start() {
    this.emailWatcher.start()
    this.storageSync.start()
    this._startKsefPolling()
    this.emit('started')
  }

  stop() {
    this.emailWatcher.stop()
    this.storageSync.stop()
    this._stopKsefPolling()
    this.emit('stopped')
  }

  _startKsefPolling() {
    if (!this.ksefAccessToken) {
      return
    }

    this.ksefPollTimer = setInterval(() => this._pollKsef(), this.ksefPollInterval)
  }

  _stopKsefPolling() {
    if (this.ksefPollTimer) {
      clearInterval(this.ksefPollTimer)
      this.ksefPollTimer = null
    }
  }

  async _pollKsef() {
    if (!this.ksefAccessToken) {
      return
    }

    try {
      const invoices = await this.ksefFacade.pollNewInvoices({
        accessToken: this.ksefAccessToken,
        since: this.ksefLastPoll,
      })

      for (const invData of invoices) {
        const ksefKey = invData?.ksefReferenceNumber || invData?.ksefId || null
        await this.inbox.addInvoice(INVOICE_SOURCE.KSEF, null, {
          ...invData,
          sourceKey: ksefKey ? `ksef:${String(ksefKey)}` : null,
        })
      }

      this.ksefLastPoll = new Date().toISOString()
      this.emit('ksef:polled', { count: invoices.length })
    } catch (err) {
      this.emit('ksef:error', err)
    }
  }

  setKsefAccessToken(token) {
    this.ksefAccessToken = token
    if (token && !this.ksefPollTimer) {
      this._startKsefPolling()
    }
  }

  async processInvoice(invoiceId) {
    const invoice = await this.inbox.getInvoice(invoiceId)
    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`)
    }

    await this.inbox.setStatus(invoiceId, INVOICE_STATUS.OCR)

    const ocrResult = await this.ocrPipeline.process(invoice)

    const updatedInvoice = await this.inbox.updateInvoice(invoiceId, {
      ocrData: ocrResult,
      parsedData: ocrResult,
      invoiceNumber: ocrResult.invoiceNumber || invoice.invoiceNumber,
      issueDate: ocrResult.issueDate || invoice.issueDate,
      contractorNip: ocrResult.sellerNip || invoice.contractorNip,
      contractorName: ocrResult.sellerName || invoice.contractorName,
      grossAmount: ocrResult.grossAmount || invoice.grossAmount,
      netAmount: ocrResult.netAmount || invoice.netAmount,
      vatAmount: ocrResult.vatAmount || invoice.vatAmount,
    })

    const suggestion = await this.autoDescribe.suggest(updatedInvoice)

    const described = await this.inbox.updateInvoice(invoiceId, {
      suggestion,
      category: suggestion.category,
      mpk: suggestion.mpk,
      description: suggestion.description,
    })

    await this.inbox.setStatus(invoiceId, INVOICE_STATUS.DESCRIBED)

    return described
  }

  async approveInvoice(invoiceId, overrides = {}) {
    const invoice = await this.inbox.getInvoice(invoiceId)
    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`)
    }

    await this.inbox.updateInvoice(invoiceId, overrides)
    await this.inbox.setStatus(invoiceId, INVOICE_STATUS.APPROVED)

    await this.autoDescribe.saveToHistory(invoice)

    return this.inbox.getInvoice(invoiceId)
  }

  async rejectInvoice(invoiceId, reason) {
    await this.inbox.updateInvoice(invoiceId, { rejectionReason: reason })
    return this.inbox.setStatus(invoiceId, INVOICE_STATUS.REJECTED)
  }

  async exportApproved(format, options = {}) {
    const approved = await this.inbox.listInvoices({ status: INVOICE_STATUS.APPROVED })
    return this.exportService.exportInvoices(approved, format, options)
  }

  async getStats() {
    return this.inbox.getStats()
  }

  async listInvoices(filter = {}) {
    return this.inbox.listInvoices(filter)
  }

  async getInvoice(id) {
    return this.inbox.getInvoice(id)
  }

  async addManualInvoice(source, file, metadata) {
    return this.inbox.addInvoice(source, file, metadata)
  }

  configureEmail(config) {
    if (config.imap) {
      this.emailWatcher.setImapConfig(config.imap)
    }
    if (config.oauth) {
      this.emailWatcher.setOauthConfig(config.oauth)
    }
  }

  configureStorage(config) {
    if (config.watchPaths) {
      if (typeof this.storageSync.setWatchPaths === 'function') {
        this.storageSync.setWatchPaths(config.watchPaths)
      } else {
        for (const p of config.watchPaths) {
          this.storageSync.addWatchPath(p)
        }
      }
    }
    if (config.connections && typeof this.storageSync.setConnections === 'function') {
      this.storageSync.setConnections(config.connections)
    }
    if (config.oauth) {
      this.storageSync.setOauthConfig(config.oauth)
    }
  }

  configureOcr(config) {
    if (config.provider) {
      this.ocrPipeline.setProvider(config.provider)
    }
    if (config.api) {
      this.ocrPipeline.setApiConfig(config.api)
    }
  }

  configureExport(config) {
    if (config.wfirma) {
      this.exportService.setWfirmaConfig(config.wfirma)
    }
    if (config.webhookUrl) {
      this.exportService.setWebhookUrl(config.webhookUrl)
    }
  }

  addDescriptionRule(rule) {
    this.autoDescribe.addRule(rule)
  }

  async assignInvoiceToProject(invoiceId, projectId) {
    try {
      const invoice = await this.inbox.getInvoice(invoiceId)
      if (!invoice) {
        throw new Error('Invoice not found')
      }

      // Update invoice with project assignment
      const updatedInvoice = {
        ...invoice,
        projectId,
        assignedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      await this.inbox.updateInvoice(invoiceId, updatedInvoice)
      
      this.emit('invoice:assigned', { invoice: updatedInvoice, projectId })
      
      return updatedInvoice
    } catch (error) {
      throw new Error(`Failed to assign invoice to project: ${error.message}`)
    }
  }

  async assignInvoiceToExpenseType(invoiceId, expenseTypeId) {
    try {
      const invoice = await this.inbox.getInvoice(invoiceId)
      if (!invoice) {
        throw new Error('Invoice not found')
      }

      const updatedInvoice = {
        ...invoice,
        expenseTypeId,
        expenseTypeAssignedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      await this.inbox.updateInvoice(invoiceId, updatedInvoice)

      this.emit('invoice:expense_type_assigned', { invoice: updatedInvoice, expenseTypeId })

      return updatedInvoice
    } catch (error) {
      throw new Error(`Failed to assign invoice to expense type: ${error.message}`)
    }
  }

  async assignInvoiceToLabels(invoiceId, labelIds) {
    try {
      const invoice = await this.inbox.getInvoice(invoiceId)
      if (!invoice) {
        throw new Error('Invoice not found')
      }

      const normalized = Array.isArray(labelIds)
        ? Array.from(new Set(labelIds.map((v) => String(v)).map((v) => v.trim()).filter(Boolean)))
        : []

      const updatedInvoice = {
        ...invoice,
        labelIds: normalized,
        labelsAssignedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await this.inbox.updateInvoice(invoiceId, updatedInvoice)
      this.emit('invoice:labels_assigned', { invoice: updatedInvoice, labelIds: normalized })
      return updatedInvoice
    } catch (error) {
      throw new Error(`Failed to assign invoice to labels: ${error.message}`)
    }
  }
}

function createInvoiceWorkflow(options = {}) {
  return new InvoiceWorkflow(options)
}

module.exports = {
  InvoiceWorkflow,
  createInvoiceWorkflow,
  INVOICE_STATUS,
  INVOICE_SOURCE,
}
