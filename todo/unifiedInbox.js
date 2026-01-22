/**
 * Unified Invoice Inbox
 * Centralny punkt zbierania faktur ze wszystkich źródeł
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

const InvoiceStatus = {
  PENDING: 'pending',       // nowa, czeka na OCR
  PROCESSING: 'processing', // w trakcie OCR
  READY: 'ready',          // po OCR, czeka na opis
  DESCRIBED: 'described',   // opisana, czeka na zatwierdzenie
  APPROVED: 'approved',     // zatwierdzona przez użytkownika
  EXPORTED: 'exported',     // wysłana do księgowego
  REJECTED: 'rejected'      // odrzucona
};

const InvoiceSource = {
  EMAIL: 'email',
  SCANNER: 'scanner',
  STORAGE: 'storage',
  KSEF: 'ksef',
  MANUAL: 'manual'
};

class UnifiedInbox extends EventEmitter {
  constructor(options = {}) {
    super();
    this.invoices = new Map();
    this.store = options.store || null; // SQLite/PostgreSQL adapter
  }

  /**
   * Dodaj fakturę do inbox
   */
  async addInvoice({ source, file, metadata = {} }) {
    const invoice = {
      id: crypto.randomUUID(),
      source,
      status: source === InvoiceSource.KSEF ? InvoiceStatus.READY : InvoiceStatus.PENDING,
      
      // Plik źródłowy
      originalFile: {
        path: file.path,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size
      },
      
      // Dane z KSeF (jeśli dostępne)
      ksef: metadata.ksefId ? {
        id: metadata.ksefId,
        referenceNumber: metadata.ksefReferenceNumber,
        invoiceDate: metadata.invoiceDate,
        acquisitionTimestamp: metadata.acquisitionTimestamp
      } : null,
      
      // Dane wyodrębnione (po OCR lub z KSeF)
      extracted: null,
      
      // Opis użytkownika
      description: {
        category: null,
        mpk: null,
        notes: null,
        tags: []
      },
      
      // Sugestie auto-opisu
      suggestions: null,
      
      // Metadane
      createdAt: new Date(),
      updatedAt: new Date(),
      processedAt: null,
      describedAt: null,
      approvedAt: null,
      exportedAt: null,
      
      // Źródło (szczegóły)
      sourceDetails: {
        emailFrom: metadata.emailFrom || null,
        emailSubject: metadata.emailSubject || null,
        storagePath: metadata.storagePath || null,
        scannerDevice: metadata.scannerDevice || null
      }
    };
    
    this.invoices.set(invoice.id, invoice);
    
    if (this.store) {
      await this.store.saveInvoice(invoice);
    }
    
    this.emit('invoice:added', invoice);
    return invoice;
  }

  /**
   * Aktualizuj dane wyodrębnione (po OCR)
   */
  async setExtractedData(invoiceId, extractedData) {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);
    
    invoice.extracted = {
      invoiceNumber: extractedData.invoiceNumber,
      issueDate: extractedData.issueDate,
      dueDate: extractedData.dueDate,
      
      seller: {
        name: extractedData.sellerName,
        nip: extractedData.sellerNip,
        address: extractedData.sellerAddress
      },
      
      buyer: {
        name: extractedData.buyerName,
        nip: extractedData.buyerNip,
        address: extractedData.buyerAddress
      },
      
      amounts: {
        net: extractedData.netAmount,
        vat: extractedData.vatAmount,
        gross: extractedData.grossAmount,
        currency: extractedData.currency || 'PLN'
      },
      
      items: extractedData.items || [],
      
      ocrConfidence: extractedData.confidence || null
    };
    
    invoice.status = InvoiceStatus.READY;
    invoice.processedAt = new Date();
    invoice.updatedAt = new Date();
    
    if (this.store) {
      await this.store.updateInvoice(invoice);
    }
    
    this.emit('invoice:processed', invoice);
    return invoice;
  }

  /**
   * Ustaw sugestie auto-opisu
   */
  async setSuggestions(invoiceId, suggestions) {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);
    
    invoice.suggestions = {
      category: suggestions.category,
      mpk: suggestions.mpk,
      confidence: suggestions.confidence,
      basedOnHistory: suggestions.basedOnHistory || 0,
      alternativeCategories: suggestions.alternatives || []
    };
    
    invoice.updatedAt = new Date();
    
    if (this.store) {
      await this.store.updateInvoice(invoice);
    }
    
    this.emit('invoice:suggestions', invoice);
    return invoice;
  }

  /**
   * Opisz fakturę
   */
  async describe(invoiceId, description) {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);
    
    invoice.description = {
      category: description.category,
      mpk: description.mpk || null,
      notes: description.notes || null,
      tags: description.tags || []
    };
    
    invoice.status = InvoiceStatus.DESCRIBED;
    invoice.describedAt = new Date();
    invoice.updatedAt = new Date();
    
    if (this.store) {
      await this.store.updateInvoice(invoice);
    }
    
    this.emit('invoice:described', invoice);
    return invoice;
  }

  /**
   * Zatwierdź fakturę
   */
  async approve(invoiceId) {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) throw new Error(`Invoice ${invoiceId} not found`);
    
    if (invoice.status !== InvoiceStatus.DESCRIBED) {
      throw new Error(`Cannot approve invoice in status: ${invoice.status}`);
    }
    
    invoice.status = InvoiceStatus.APPROVED;
    invoice.approvedAt = new Date();
    invoice.updatedAt = new Date();
    
    if (this.store) {
      await this.store.updateInvoice(invoice);
    }
    
    this.emit('invoice:approved', invoice);
    return invoice;
  }

  /**
   * Pobierz faktury według statusu
   */
  getByStatus(status) {
    return Array.from(this.invoices.values())
      .filter(inv => inv.status === status)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Pobierz faktury do opisania (pending + ready)
   */
  getPendingDescription() {
    return Array.from(this.invoices.values())
      .filter(inv => [InvoiceStatus.PENDING, InvoiceStatus.READY].includes(inv.status))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Statystyki inbox
   */
  getStats() {
    const invoices = Array.from(this.invoices.values());
    return {
      total: invoices.length,
      byStatus: {
        pending: invoices.filter(i => i.status === InvoiceStatus.PENDING).length,
        processing: invoices.filter(i => i.status === InvoiceStatus.PROCESSING).length,
        ready: invoices.filter(i => i.status === InvoiceStatus.READY).length,
        described: invoices.filter(i => i.status === InvoiceStatus.DESCRIBED).length,
        approved: invoices.filter(i => i.status === InvoiceStatus.APPROVED).length,
        exported: invoices.filter(i => i.status === InvoiceStatus.EXPORTED).length
      },
      bySource: {
        email: invoices.filter(i => i.source === InvoiceSource.EMAIL).length,
        scanner: invoices.filter(i => i.source === InvoiceSource.SCANNER).length,
        storage: invoices.filter(i => i.source === InvoiceSource.STORAGE).length,
        ksef: invoices.filter(i => i.source === InvoiceSource.KSEF).length
      }
    };
  }
}

function createUnifiedInbox(options) {
  return new UnifiedInbox(options);
}

module.exports = {
  UnifiedInbox,
  createUnifiedInbox,
  InvoiceStatus,
  InvoiceSource
};
