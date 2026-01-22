/**
 * Email Watcher
 * Monitoring skrzynek email w poszukiwaniu faktur (załączniki PDF/JPG)
 */

const { EventEmitter } = require('events');
const Imap = require('imap'); // npm install imap
const { simpleParser } = require('mailparser'); // npm install mailparser

const INVOICE_KEYWORDS = [
  'faktura', 'invoice', 'fv/', 'rachunek',
  'płatność', 'payment', 'należność'
];

const ATTACHMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/jpg'
];

class EmailWatcher extends EventEmitter {
  constructor(options = {}) {
    super();
    this.accounts = new Map();
    this.pollInterval = options.pollInterval || 5 * 60 * 1000; // 5 min
    this.timers = new Map();
    this.processedIds = new Set(); // cache przetworzonych wiadomości
  }

  /**
   * Dodaj konto IMAP do monitorowania
   */
  addAccount(accountId, config) {
    const account = {
      id: accountId,
      type: 'imap',
      config: {
        user: config.user,
        password: config.password,
        host: config.host,
        port: config.port || 993,
        tls: config.tls !== false,
        tlsOptions: { rejectUnauthorized: false }
      },
      folders: config.folders || ['INBOX'],
      lastCheck: null,
      enabled: true
    };
    
    this.accounts.set(accountId, account);
    this.emit('account:added', account);
    return account;
  }

  /**
   * Dodaj konto Gmail OAuth (uproszczona konfiguracja)
   */
  addGmailOAuth(accountId, { email, accessToken, refreshToken }) {
    const account = {
      id: accountId,
      type: 'gmail-oauth',
      config: {
        user: email,
        xoauth2: this._generateXOAuth2Token(email, accessToken)
      },
      refreshToken,
      folders: ['INBOX'],
      lastCheck: null,
      enabled: true
    };
    
    this.accounts.set(accountId, account);
    return account;
  }

  /**
   * Rozpocznij monitoring wszystkich kont
   */
  startWatching() {
    for (const [accountId, account] of this.accounts) {
      if (account.enabled) {
        this._watchAccount(accountId);
      }
    }
  }

  /**
   * Zatrzymaj monitoring
   */
  stopWatching() {
    for (const [accountId, timer] of this.timers) {
      clearInterval(timer);
      this.timers.delete(accountId);
    }
  }

  /**
   * Sprawdź konto jednorazowo
   */
  async checkAccount(accountId) {
    const account = this.accounts.get(accountId);
    if (!account) throw new Error(`Account ${accountId} not found`);
    
    const invoices = [];
    
    try {
      const imap = new Imap(account.config);
      
      await this._connectImap(imap);
      
      for (const folder of account.folders) {
        const folderInvoices = await this._scanFolder(imap, folder, account.lastCheck);
        invoices.push(...folderInvoices);
      }
      
      imap.end();
      
      account.lastCheck = new Date();
      
      for (const invoice of invoices) {
        this.emit('invoice:found', invoice);
      }
      
    } catch (error) {
      this.emit('error', { accountId, error });
    }
    
    return invoices;
  }

  // --- Private methods ---

  _watchAccount(accountId) {
    // Pierwsze sprawdzenie od razu
    this.checkAccount(accountId);
    
    // Kolejne co pollInterval
    const timer = setInterval(() => {
      this.checkAccount(accountId);
    }, this.pollInterval);
    
    this.timers.set(accountId, timer);
  }

  _connectImap(imap) {
    return new Promise((resolve, reject) => {
      imap.once('ready', resolve);
      imap.once('error', reject);
      imap.connect();
    });
  }

  async _scanFolder(imap, folder, since) {
    const invoices = [];
    
    await new Promise((resolve, reject) => {
      imap.openBox(folder, true, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Szukaj wiadomości z załącznikami
    const searchCriteria = since 
      ? ['SINCE', since, ['OR', ['HEADER', 'CONTENT-TYPE', 'multipart'], 'ALL']]
      : [['OR', ['HEADER', 'CONTENT-TYPE', 'multipart'], 'ALL']];
    
    const messages = await this._searchMessages(imap, searchCriteria);
    
    for (const msg of messages) {
      // Pomiń już przetworzone
      if (this.processedIds.has(msg.uid)) continue;
      
      const parsed = await this._fetchAndParse(imap, msg.uid);
      
      if (this._looksLikeInvoice(parsed)) {
        const attachments = this._extractInvoiceAttachments(parsed);
        
        for (const attachment of attachments) {
          invoices.push({
            source: 'email',
            file: {
              name: attachment.filename,
              path: null, // będzie zapisane przez inbox
              mimeType: attachment.contentType,
              size: attachment.size,
              content: attachment.content // Buffer
            },
            metadata: {
              emailFrom: parsed.from?.text || 'unknown',
              emailSubject: parsed.subject || '',
              emailDate: parsed.date,
              emailMessageId: parsed.messageId
            }
          });
        }
      }
      
      this.processedIds.add(msg.uid);
    }
    
    return invoices;
  }

  _searchMessages(imap, criteria) {
    return new Promise((resolve, reject) => {
      imap.search(criteria, (err, results) => {
        if (err) reject(err);
        else resolve(results.map(uid => ({ uid })));
      });
    });
  }

  _fetchAndParse(imap, uid) {
    return new Promise((resolve, reject) => {
      const fetch = imap.fetch(uid, { bodies: '' });
      
      fetch.on('message', (msg) => {
        msg.on('body', (stream) => {
          simpleParser(stream, (err, parsed) => {
            if (err) reject(err);
            else resolve(parsed);
          });
        });
      });
      
      fetch.once('error', reject);
    });
  }

  _looksLikeInvoice(parsed) {
    const subject = (parsed.subject || '').toLowerCase();
    const text = (parsed.text || '').toLowerCase();
    
    // Sprawdź słowa kluczowe
    for (const keyword of INVOICE_KEYWORDS) {
      if (subject.includes(keyword) || text.includes(keyword)) {
        return true;
      }
    }
    
    // Sprawdź czy ma załączniki PDF
    if (parsed.attachments?.some(a => ATTACHMENT_TYPES.includes(a.contentType))) {
      return true;
    }
    
    return false;
  }

  _extractInvoiceAttachments(parsed) {
    return (parsed.attachments || [])
      .filter(a => ATTACHMENT_TYPES.includes(a.contentType))
      .map(a => ({
        filename: a.filename || `attachment_${Date.now()}.pdf`,
        contentType: a.contentType,
        size: a.size,
        content: a.content
      }));
  }

  _generateXOAuth2Token(email, accessToken) {
    const authString = `user=${email}\x01auth=Bearer ${accessToken}\x01\x01`;
    return Buffer.from(authString).toString('base64');
  }
}

function createEmailWatcher(options) {
  return new EmailWatcher(options);
}

module.exports = {
  EmailWatcher,
  createEmailWatcher,
  INVOICE_KEYWORDS,
  ATTACHMENT_TYPES
};
