const EventEmitter = require('node:events')

const EMAIL_PROVIDERS = {
  IMAP: 'imap',
  GMAIL_OAUTH: 'gmail-oauth',
  OUTLOOK_OAUTH: 'outlook-oauth',
}

const ATTACHMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']

class EmailWatcher extends EventEmitter {
  constructor(options = {}) {
    super()
    this.provider = options.provider || EMAIL_PROVIDERS.IMAP
    this.pollInterval = options.pollInterval || 300000
    this.imapConfig = options.imapConfig || null
    this.oauthConfig = options.oauthConfig || null
    this.inbox = options.inbox || null
    this.lastCheckTime = null
    this.isRunning = false
    this.pollTimer = null
  }

  async start() {
    if (this.isRunning) {
      return
    }
    this.isRunning = true
    this.emit('started')
    await this._poll()
    this.pollTimer = setInterval(() => this._poll(), this.pollInterval)
  }

  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    this.isRunning = false
    this.emit('stopped')
  }

  async _poll() {
    try {
      this.emit('polling')
      const invoices = await this.checkForInvoices()
      this.lastCheckTime = new Date().toISOString()
      this.emit('poll:complete', { count: invoices.length })
    } catch (err) {
      this.emit('error', err)
    }
  }

  async checkForInvoices() {
    const emails = await this._fetchEmails()
    const invoices = []

    for (const email of emails) {
      const attachments = this._filterInvoiceAttachments(email.attachments || [])

      for (const attachment of attachments) {
        if (this.inbox) {
          const emailId = email?.id || email?.messageId || email?.uid || null
          const sourceKey = emailId
            ? `email:${String(emailId)}:${String(attachment.filename || '')}`
            : `email:${String(email?.from || '')}:${String(email?.date || '')}:${String(attachment.filename || '')}:${String(attachment.size || '')}`
          const invoice = await this.inbox.addInvoice('email', attachment.content, {
            fileName: attachment.filename,
            fileType: attachment.contentType,
            fileSize: attachment.size,
            sourceKey,
            emailSubject: email.subject,
            emailFrom: email.from,
            emailDate: email.date,
          })
          invoices.push(invoice)
          this.emit('invoice:found', invoice)
        }
      }
    }

    return invoices
  }

  async _fetchEmails() {
    if (this.provider === EMAIL_PROVIDERS.IMAP) {
      return this._fetchImap()
    } else if (this.provider === EMAIL_PROVIDERS.GMAIL_OAUTH) {
      return this._fetchGmailOauth()
    } else if (this.provider === EMAIL_PROVIDERS.OUTLOOK_OAUTH) {
      return this._fetchOutlookOauth()
    }
    return []
  }

  async _fetchImap() {
    if (!this.imapConfig) {
      return []
    }

    // Placeholder - requires imap library integration
    // const Imap = require('imap')
    // Implementation would:
    // 1. Connect to IMAP server
    // 2. Search for unseen emails with attachments
    // 3. Download attachments
    // 4. Mark as seen or move to processed folder

    this.emit('imap:fetch', { since: this.lastCheckTime })
    return []
  }

  async _fetchGmailOauth() {
    if (!this.oauthConfig) {
      return []
    }

    // Placeholder - requires googleapis integration
    // const { google } = require('googleapis')
    // Implementation would:
    // 1. Authenticate with OAuth2
    // 2. List messages with has:attachment
    // 3. Get message details and attachments
    // 4. Add label "processed"

    this.emit('gmail:fetch', { since: this.lastCheckTime })
    return []
  }

  async _fetchOutlookOauth() {
    if (!this.oauthConfig) {
      return []
    }

    // Placeholder - requires @microsoft/microsoft-graph-client
    // Implementation would:
    // 1. Authenticate with OAuth2
    // 2. List messages with attachments
    // 3. Download attachments
    // 4. Move to processed folder

    this.emit('outlook:fetch', { since: this.lastCheckTime })
    return []
  }

  _filterInvoiceAttachments(attachments) {
    return attachments.filter((att) => {
      const type = (att.contentType || '').toLowerCase()
      const name = (att.filename || '').toLowerCase()
      return (
        ATTACHMENT_TYPES.some((t) => type.includes(t)) ||
        name.endsWith('.pdf') ||
        name.endsWith('.jpg') ||
        name.endsWith('.jpeg') ||
        name.endsWith('.png')
      )
    })
  }

  setImapConfig(config) {
    this.imapConfig = {
      host: config.host,
      port: config.port || 993,
      tls: config.tls !== false,
      user: config.user,
      password: config.password,
      mailbox: config.mailbox || 'INBOX',
    }
  }

  setOauthConfig(config) {
    this.oauthConfig = {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken: config.refreshToken,
      accessToken: config.accessToken,
    }
  }
}

function createEmailWatcher(options = {}) {
  return new EmailWatcher(options)
}

module.exports = {
  EmailWatcher,
  createEmailWatcher,
  EMAIL_PROVIDERS,
  ATTACHMENT_TYPES,
}
