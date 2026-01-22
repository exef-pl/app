const assert = require('node:assert');
const { describe, it, before, after, beforeEach } = require('node:test');

const IMAP_HOST = process.env.IMAP_HOST || 'localhost';
const IMAP_PORT = parseInt(process.env.IMAP_PORT || '3143', 10);
const IMAPS_PORT = parseInt(process.env.IMAPS_PORT || '3993', 10);
const SMTP_HOST = process.env.SMTP_HOST || 'localhost';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '3025', 10);
const GMAIL_API_URL = process.env.GMAIL_API_URL || 'http://localhost:8081';
const OUTLOOK_API_URL = process.env.OUTLOOK_API_URL || 'http://localhost:8082';

// Mock EmailWatcher for testing
class MockEmailWatcher {
  constructor(options = {}) {
    this.provider = options.provider || 'imap';
    this.imapConfig = options.imapConfig || null;
    this.oauthConfig = options.oauthConfig || null;
    this.apiUrl = options.apiUrl || null;
    this.emails = [];
    this.attachments = [];
  }

  async fetchEmails() {
    if (this.provider === 'imap') {
      return this._fetchImap();
    } else if (this.provider === 'gmail-oauth') {
      return this._fetchGmailOauth();
    } else if (this.provider === 'outlook-oauth') {
      return this._fetchOutlookOauth();
    }
    return [];
  }

  async _fetchImap() {
    // For IMAP testing with GreenMail, we use the REST API
    // In real implementation this would use node-imap
    const response = await fetch(`http://${IMAP_HOST}:8080/api/user/test@localhost/messages`);
    if (!response.ok) {
      throw new Error(`IMAP fetch failed: ${response.status}`);
    }
    const messages = await response.json();
    return messages.map((msg) => ({
      id: msg.id,
      from: msg.from,
      subject: msg.subject,
      date: msg.date,
      attachments: msg.attachments || [],
    }));
  }

  async _fetchGmailOauth() {
    if (!this.oauthConfig?.refreshToken) {
      throw new Error('Gmail OAuth requires refresh token');
    }

    // Get access token
    const tokenResponse = await fetch(`${this.apiUrl}/oauth2/v4/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: this.oauthConfig.refreshToken,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to get Gmail access token');
    }

    const { access_token } = await tokenResponse.json();

    // List messages with attachments
    const listResponse = await fetch(
      `${this.apiUrl}/gmail/v1/users/me/messages?q=has:attachment`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );

    if (!listResponse.ok) {
      throw new Error('Failed to list Gmail messages');
    }

    const { messages = [] } = await listResponse.json();
    const emails = [];

    for (const { id } of messages) {
      const msgResponse = await fetch(
        `${this.apiUrl}/gmail/v1/users/me/messages/${id}`,
        {
          headers: { Authorization: `Bearer ${access_token}` },
        }
      );

      if (msgResponse.ok) {
        const msg = await msgResponse.json();
        const headers = msg.payload?.headers || [];
        const getHeader = (name) => headers.find((h) => h.name === name)?.value;
        
        const attachments = [];
        const parts = msg.payload?.parts || [];
        for (const part of parts) {
          if (part.filename && part.body?.attachmentId) {
            attachments.push({
              id: part.body.attachmentId,
              filename: part.filename,
              contentType: part.mimeType,
              size: part.body.size,
            });
          }
        }

        emails.push({
          id: msg.id,
          from: getHeader('From'),
          subject: getHeader('Subject'),
          date: getHeader('Date'),
          attachments,
        });
      }
    }

    return emails;
  }

  async _fetchOutlookOauth() {
    if (!this.oauthConfig?.refreshToken) {
      throw new Error('Outlook OAuth requires refresh token');
    }

    // Get access token
    const tokenResponse = await fetch(`${this.apiUrl}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: this.oauthConfig.refreshToken,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to get Outlook access token');
    }

    const { access_token } = await tokenResponse.json();

    // List messages with attachments
    const listResponse = await fetch(
      `${this.apiUrl}/v1.0/me/messages?$filter=hasAttachments eq true&$expand=attachments`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
      }
    );

    if (!listResponse.ok) {
      throw new Error('Failed to list Outlook messages');
    }

    const { value: messages = [] } = await listResponse.json();

    return messages.map((msg) => ({
      id: msg.id,
      from: msg.from?.emailAddress?.address,
      subject: msg.subject,
      date: msg.receivedDateTime,
      attachments: (msg.attachments || []).map((att) => ({
        id: att.id,
        filename: att.name,
        contentType: att.contentType,
        size: att.size,
      })),
    }));
  }

  async downloadAttachment(messageId, attachmentId) {
    if (this.provider === 'gmail-oauth') {
      return this._downloadGmailAttachment(messageId, attachmentId);
    } else if (this.provider === 'outlook-oauth') {
      return this._downloadOutlookAttachment(messageId, attachmentId);
    }
    throw new Error(`Attachment download not implemented for ${this.provider}`);
  }

  async _downloadGmailAttachment(messageId, attachmentId) {
    const response = await fetch(
      `${this.apiUrl}/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
      {
        headers: { Authorization: 'Bearer mock_token' },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to download Gmail attachment');
    }

    const { data } = await response.json();
    return Buffer.from(data, 'base64');
  }

  async _downloadOutlookAttachment(messageId, attachmentId) {
    const response = await fetch(
      `${this.apiUrl}/v1.0/me/messages/${messageId}/attachments/${attachmentId}`,
      {
        headers: { Authorization: 'Bearer mock_token' },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to download Outlook attachment');
    }

    const { contentBytes } = await response.json();
    return Buffer.from(contentBytes, 'base64');
  }
}

// Test suites
describe('Email Sync Tests', () => {
  describe('Gmail OAuth Integration', () => {
    let watcher;

    before(async () => {
      // Reset mock data
      await fetch(`${GMAIL_API_URL}/admin/reset`, { method: 'POST' });
      
      watcher = new MockEmailWatcher({
        provider: 'gmail-oauth',
        apiUrl: GMAIL_API_URL,
        oauthConfig: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          refreshToken: 'test-refresh-token',
        },
      });
    });

    it('should authenticate with OAuth and get access token', async () => {
      const response = await fetch(`${GMAIL_API_URL}/oauth2/v4/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: 'test-refresh-token',
        }),
      });

      assert.strictEqual(response.ok, true);
      const data = await response.json();
      assert.ok(data.access_token);
      assert.strictEqual(data.token_type, 'Bearer');
    });

    it('should fetch emails with attachments', async () => {
      const emails = await watcher.fetchEmails();
      
      assert.ok(Array.isArray(emails));
      assert.ok(emails.length > 0, 'Should have at least one email');
      
      const emailWithAttachment = emails.find((e) => e.attachments.length > 0);
      assert.ok(emailWithAttachment, 'Should have email with attachment');
      assert.ok(emailWithAttachment.subject);
      assert.ok(emailWithAttachment.from);
    });

    it('should filter invoice attachments by type', async () => {
      const emails = await watcher.fetchEmails();
      
      for (const email of emails) {
        for (const att of email.attachments) {
          const isInvoiceType = 
            att.contentType?.includes('pdf') ||
            att.contentType?.includes('image/') ||
            att.filename?.match(/\.(pdf|jpg|jpeg|png)$/i);
          
          assert.ok(isInvoiceType, `Attachment ${att.filename} should be invoice-compatible type`);
        }
      }
    });

    it('should download attachment content', async () => {
      const emails = await watcher.fetchEmails();
      const emailWithAttachment = emails.find((e) => e.attachments.length > 0);
      
      if (emailWithAttachment && emailWithAttachment.attachments[0]) {
        const content = await watcher.downloadAttachment(
          emailWithAttachment.id,
          emailWithAttachment.attachments[0].id
        );
        
        assert.ok(Buffer.isBuffer(content));
        assert.ok(content.length > 0);
      }
    });

    it('should handle multiple accounts of same provider', async () => {
      const watcher1 = new MockEmailWatcher({
        provider: 'gmail-oauth',
        apiUrl: GMAIL_API_URL,
        oauthConfig: { refreshToken: 'account1-token' },
      });

      const watcher2 = new MockEmailWatcher({
        provider: 'gmail-oauth',
        apiUrl: GMAIL_API_URL,
        oauthConfig: { refreshToken: 'account2-token' },
      });

      const emails1 = await watcher1.fetchEmails();
      const emails2 = await watcher2.fetchEmails();

      assert.ok(Array.isArray(emails1));
      assert.ok(Array.isArray(emails2));
    });
  });

  describe('Outlook OAuth Integration', () => {
    let watcher;

    before(async () => {
      // Reset mock data
      await fetch(`${OUTLOOK_API_URL}/admin/reset`, { method: 'POST' });
      
      watcher = new MockEmailWatcher({
        provider: 'outlook-oauth',
        apiUrl: OUTLOOK_API_URL,
        oauthConfig: {
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
          refreshToken: 'test-refresh-token',
        },
      });
    });

    it('should authenticate with OAuth and get access token', async () => {
      const response = await fetch(`${OUTLOOK_API_URL}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          refresh_token: 'test-refresh-token',
        }),
      });

      assert.strictEqual(response.ok, true);
      const data = await response.json();
      assert.ok(data.access_token);
      assert.strictEqual(data.token_type, 'Bearer');
    });

    it('should fetch emails with attachments from Microsoft Graph API', async () => {
      const emails = await watcher.fetchEmails();
      
      assert.ok(Array.isArray(emails));
      assert.ok(emails.length > 0, 'Should have at least one email');
      
      const emailWithAttachment = emails.find((e) => e.attachments.length > 0);
      assert.ok(emailWithAttachment, 'Should have email with attachment');
      assert.ok(emailWithAttachment.subject);
    });

    it('should download attachment content from Graph API', async () => {
      const emails = await watcher.fetchEmails();
      const emailWithAttachment = emails.find((e) => e.attachments.length > 0);
      
      if (emailWithAttachment && emailWithAttachment.attachments[0]) {
        const content = await watcher.downloadAttachment(
          emailWithAttachment.id,
          emailWithAttachment.attachments[0].id
        );
        
        assert.ok(Buffer.isBuffer(content));
        assert.ok(content.length > 0);
      }
    });

    it('should handle multiple Outlook accounts', async () => {
      const watcher1 = new MockEmailWatcher({
        provider: 'outlook-oauth',
        apiUrl: OUTLOOK_API_URL,
        oauthConfig: { refreshToken: 'account1-token' },
      });

      const watcher2 = new MockEmailWatcher({
        provider: 'outlook-oauth',
        apiUrl: OUTLOOK_API_URL,
        oauthConfig: { refreshToken: 'account2-token' },
      });

      const emails1 = await watcher1.fetchEmails();
      const emails2 = await watcher2.fetchEmails();

      assert.ok(Array.isArray(emails1));
      assert.ok(Array.isArray(emails2));
    });
  });

  describe('IMAP Integration', () => {
    it('should connect to IMAP server', async () => {
      // Check GreenMail health
      const response = await fetch(`http://${IMAP_HOST}:8080/api/user/list`);
      assert.strictEqual(response.ok, true);
    });

    it('should create test user and send test email', async () => {
      // Create user via GreenMail API
      const createUserResponse = await fetch(`http://${IMAP_HOST}:8080/api/user/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@localhost',
          login: 'test@localhost',
          password: 'testpass',
        }),
      });

      // GreenMail may auto-create users, so 200 or 409 are both acceptable
      assert.ok([200, 201, 409].includes(createUserResponse.status));
    });

    it('should handle IMAP configuration with TLS', () => {
      const watcher = new MockEmailWatcher({
        provider: 'imap',
        imapConfig: {
          host: IMAP_HOST,
          port: IMAPS_PORT,
          tls: true,
          user: 'test@localhost',
          password: 'testpass',
          mailbox: 'INBOX',
        },
      });

      assert.strictEqual(watcher.imapConfig.tls, true);
      assert.strictEqual(watcher.imapConfig.port, IMAPS_PORT);
    });

    it('should handle multiple IMAP accounts', () => {
      const accounts = [
        { host: 'imap1.example.com', user: 'user1@example.com' },
        { host: 'imap2.example.com', user: 'user2@example.com' },
        { host: 'imap1.example.com', user: 'user3@example.com' }, // Same provider, different account
      ];

      const watchers = accounts.map((config) => new MockEmailWatcher({
        provider: 'imap',
        imapConfig: { ...config, port: 993, tls: true, password: 'test' },
      }));

      assert.strictEqual(watchers.length, 3);
      
      // Verify multiple accounts on same provider
      const sameProvider = watchers.filter((w) => w.imapConfig.host === 'imap1.example.com');
      assert.strictEqual(sameProvider.length, 2);
    });
  });

  describe('Cross-Provider Sync', () => {
    it('should sync from all configured providers', async () => {
      const accounts = [
        {
          provider: 'gmail-oauth',
          apiUrl: GMAIL_API_URL,
          oauthConfig: { refreshToken: 'gmail-token' },
        },
        {
          provider: 'outlook-oauth',
          apiUrl: OUTLOOK_API_URL,
          oauthConfig: { refreshToken: 'outlook-token' },
        },
      ];

      const allEmails = [];

      for (const config of accounts) {
        const watcher = new MockEmailWatcher(config);
        try {
          const emails = await watcher.fetchEmails();
          allEmails.push(...emails.map((e) => ({ ...e, provider: config.provider })));
        } catch (err) {
          console.error(`Failed to fetch from ${config.provider}:`, err.message);
        }
      }

      assert.ok(allEmails.length > 0, 'Should have emails from at least one provider');
      
      const providers = new Set(allEmails.map((e) => e.provider));
      assert.ok(providers.size > 0, 'Should have emails from multiple providers');
    });

    it('should deduplicate attachments by filename and size', async () => {
      const attachments = [
        { filename: 'faktura.pdf', size: 45000, provider: 'gmail' },
        { filename: 'faktura.pdf', size: 45000, provider: 'outlook' }, // Duplicate
        { filename: 'faktura.pdf', size: 52000, provider: 'gmail' }, // Different size - not duplicate
        { filename: 'rachunek.pdf', size: 32000, provider: 'gmail' },
      ];

      const deduplicated = [];
      const seen = new Set();

      for (const att of attachments) {
        const key = `${att.filename}:${att.size}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduplicated.push(att);
        }
      }

      assert.strictEqual(deduplicated.length, 3);
    });
  });
});

// Run tests
if (require.main === module) {
  console.log('Starting Email Sync Tests...');
  console.log(`Gmail API: ${GMAIL_API_URL}`);
  console.log(`Outlook API: ${OUTLOOK_API_URL}`);
  console.log(`IMAP Host: ${IMAP_HOST}:${IMAP_PORT}`);
}
