/**
 * Invoice Orchestrator
 * Łączy wszystkie moduły w spójny pipeline przetwarzania faktur
 */

const { EventEmitter } = require('events');
const { createUnifiedInbox, InvoiceSource, InvoiceStatus } = require('./unifiedInbox');
const { createEmailWatcher } = require('./emailWatcher');
const { createStorageSync } = require('./storageSync');
const { createAutoDescribeEngine } = require('./autoDescribe');

class InvoiceOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // Core modules
    this.inbox = createUnifiedInbox({ store: options.store });
    this.emailWatcher = createEmailWatcher({ pollInterval: options.emailPollInterval });
    this.storageSync = createStorageSync();
    this.autoDescribe = createAutoDescribeEngine({ store: options.store });
    
    // OCR provider (do podmiany na Tesseract/Google Vision/Comarch)
    this.ocrProvider = options.ocrProvider || null;
    
    // KSeF facade (istniejący moduł)
    this.ksefFacade = options.ksefFacade || null;
    
    // Konfiguracja
    this.config = {
      autoOcr: options.autoOcr !== false,
      autoSuggest: options.autoSuggest !== false,
      ksefPollInterval: options.ksefPollInterval || 15 * 60 * 1000 // 15 min
    };
    
    this._setupEventHandlers();
  }

  /**
   * Inicjalizacja - uruchom wszystkie moduły
   */
  async initialize() {
    console.log('[Orchestrator] Initializing...');
    
    // Start email watcher
    if (this.emailWatcher.accounts.size > 0) {
      this.emailWatcher.startWatching();
      console.log('[Orchestrator] Email watcher started');
    }
    
    // Start storage sync
    if (this.storageSync.providers.size > 0) {
      this.storageSync.startWatching();
      console.log('[Orchestrator] Storage sync started');
    }
    
    // Start KSeF polling
    if (this.ksefFacade) {
      this._startKsefPolling();
      console.log('[Orchestrator] KSeF polling started');
    }
    
    this.emit('initialized');
  }

  /**
   * Zatrzymaj wszystkie moduły
   */
  async shutdown() {
    console.log('[Orchestrator] Shutting down...');
    
    this.emailWatcher.stopWatching();
    this.storageSync.stopWatching();
    
    if (this._ksefTimer) {
      clearInterval(this._ksefTimer);
    }
    
    this.emit('shutdown');
  }

  // --- Configuration ---

  /**
   * Dodaj konto email
   */
  addEmailAccount(accountId, config) {
    return this.emailWatcher.addAccount(accountId, config);
  }

  /**
   * Dodaj folder storage
   */
  addStorageFolder(providerId, folderPath, options) {
    return this.storageSync.addLocalFolder(providerId, folderPath, options);
  }

  /**
   * Dodaj Dropbox
   */
  addDropbox(providerId, config) {
    return this.storageSync.addDropbox(providerId, config);
  }

  /**
   * Dodaj regułę auto-opisu
   */
  addDescriptionRule(rule) {
    return this.autoDescribe.addRule(rule);
  }

  // --- Manual operations ---

  /**
   * Ręcznie dodaj fakturę
   */
  async addInvoice(source, file, metadata = {}) {
    return this.inbox.addInvoice({ source, file, metadata });
  }

  /**
   * Opisz fakturę
   */
  async describeInvoice(invoiceId, description) {
    const invoice = await this.inbox.describe(invoiceId, description);
    
    // Ucz się z opisu
    if (invoice.extracted) {
      await this.autoDescribe.learnFromApproved(invoice.extracted, description);
    }
    
    return invoice;
  }

  /**
   * Zatwierdź fakturę
   */
  async approveInvoice(invoiceId) {
    return this.inbox.approve(invoiceId);
  }

  /**
   * Zatwierdź z sugestią
   */
  async approveWithSuggestion(invoiceId) {
    const invoices = Array.from(this.inbox.invoices.values());
    const invoice = invoices.find(i => i.id === invoiceId);
    
    if (!invoice?.suggestions) {
      throw new Error('No suggestions available for this invoice');
    }
    
    await this.inbox.describe(invoiceId, {
      category: invoice.suggestions.category,
      mpk: invoice.suggestions.mpk
    });
    
    return this.inbox.approve(invoiceId);
  }

  // --- Getters ---

  /**
   * Pobierz faktury do opisania
   */
  getPendingInvoices() {
    return this.inbox.getPendingDescription();
  }

  /**
   * Pobierz zatwierdzone faktury (do eksportu)
   */
  getApprovedInvoices() {
    return this.inbox.getByStatus(InvoiceStatus.APPROVED);
  }

  /**
   * Statystyki
   */
  getStats() {
    return {
      inbox: this.inbox.getStats(),
      categories: this.autoDescribe.getCategoryStats()
    };
  }

  // --- Private methods ---

  _setupEventHandlers() {
    // Email watcher -> Inbox
    this.emailWatcher.on('invoice:found', async (data) => {
      console.log(`[Orchestrator] Invoice from email: ${data.file.name}`);
      const invoice = await this.inbox.addInvoice({
        source: InvoiceSource.EMAIL,
        file: data.file,
        metadata: data.metadata
      });
      await this._processNewInvoice(invoice);
    });

    // Storage sync -> Inbox
    this.storageSync.on('invoice:found', async (data) => {
      console.log(`[Orchestrator] Invoice from storage: ${data.file.name}`);
      const invoice = await this.inbox.addInvoice({
        source: InvoiceSource.STORAGE,
        file: data.file,
        metadata: data.metadata
      });
      await this._processNewInvoice(invoice);
    });

    // Inbox events -> Orchestrator events
    this.inbox.on('invoice:added', (inv) => this.emit('invoice:added', inv));
    this.inbox.on('invoice:processed', (inv) => this.emit('invoice:processed', inv));
    this.inbox.on('invoice:described', (inv) => this.emit('invoice:described', inv));
    this.inbox.on('invoice:approved', (inv) => this.emit('invoice:approved', inv));

    // Errors
    this.emailWatcher.on('error', (err) => this.emit('error', { source: 'email', ...err }));
    this.storageSync.on('error', (err) => this.emit('error', { source: 'storage', ...err }));
  }

  async _processNewInvoice(invoice) {
    // 1. OCR jeśli potrzebne (nie dla KSeF)
    if (this.config.autoOcr && invoice.source !== InvoiceSource.KSEF) {
      await this._runOcr(invoice);
    }

    // 2. Auto-sugestie
    if (this.config.autoSuggest && invoice.extracted) {
      await this._generateSuggestions(invoice);
    }
  }

  async _runOcr(invoice) {
    if (!this.ocrProvider) {
      console.log(`[Orchestrator] No OCR provider configured, skipping OCR`);
      return;
    }

    try {
      console.log(`[Orchestrator] Running OCR for ${invoice.id}`);
      const extracted = await this.ocrProvider.process(invoice.originalFile);
      await this.inbox.setExtractedData(invoice.id, extracted);
    } catch (error) {
      console.error(`[Orchestrator] OCR failed for ${invoice.id}:`, error);
      this.emit('error', { source: 'ocr', invoiceId: invoice.id, error });
    }
  }

  async _generateSuggestions(invoice) {
    try {
      const suggestions = await this.autoDescribe.suggest(invoice.extracted);
      await this.inbox.setSuggestions(invoice.id, suggestions);
      console.log(`[Orchestrator] Suggestions for ${invoice.id}: ${suggestions.category} (${suggestions.confidence}%)`);
    } catch (error) {
      console.error(`[Orchestrator] Auto-describe failed for ${invoice.id}:`, error);
    }
  }

  _startKsefPolling() {
    const pollKsef = async () => {
      try {
        // Pobierz nowe faktury z KSeF
        const since = this._lastKsefCheck || new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const invoices = await this.ksefFacade.queryInvoiceMetadata({
          dateFrom: since.toISOString().split('T')[0],
          subjectType: 'subject2'
        });

        for (const ksefInvoice of invoices?.invoicesList || []) {
          // Pobierz pełną fakturę
          const xmlData = await this.ksefFacade.downloadInvoice(
            ksefInvoice.ksefReferenceNumber
          );

          const invoice = await this.inbox.addInvoice({
            source: InvoiceSource.KSEF,
            file: {
              name: `${ksefInvoice.ksefReferenceNumber}.xml`,
              content: xmlData,
              mimeType: 'application/xml'
            },
            metadata: {
              ksefId: ksefInvoice.ksefReferenceNumber,
              ksefReferenceNumber: ksefInvoice.ksefReferenceNumber,
              invoiceDate: ksefInvoice.invoicingDate,
              acquisitionTimestamp: ksefInvoice.acquisitionTimestamp
            }
          });

          // Parsuj XML i wyodrębnij dane
          const extracted = this._parseKsefXml(xmlData);
          await this.inbox.setExtractedData(invoice.id, extracted);

          // Generuj sugestie
          if (this.config.autoSuggest) {
            await this._generateSuggestions(invoice);
          }
        }

        this._lastKsefCheck = new Date();
      } catch (error) {
        console.error('[Orchestrator] KSeF poll failed:', error);
        this.emit('error', { source: 'ksef', error });
      }
    };

    // Pierwsze sprawdzenie
    pollKsef();

    // Kolejne co interval
    this._ksefTimer = setInterval(pollKsef, this.config.ksefPollInterval);
  }

  _parseKsefXml(xmlContent) {
    // TODO: Implement full KSeF XML parsing
    // Na razie zwracamy placeholder
    return {
      invoiceNumber: 'FV/2026/01/001',
      issueDate: new Date().toISOString(),
      sellerName: 'Parsed from XML',
      sellerNip: '0000000000',
      grossAmount: 0,
      currency: 'PLN',
      items: []
    };
  }
}

function createInvoiceOrchestrator(options) {
  return new InvoiceOrchestrator(options);
}

module.exports = {
  InvoiceOrchestrator,
  createInvoiceOrchestrator
};
