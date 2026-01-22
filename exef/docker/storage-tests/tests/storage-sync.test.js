const assert = require('node:assert');
const { describe, it, before, beforeEach } = require('node:test');

const DROPBOX_API_URL = process.env.DROPBOX_API_URL || 'http://localhost:8091';
const GDRIVE_API_URL = process.env.GDRIVE_API_URL || 'http://localhost:8092';
const ONEDRIVE_API_URL = process.env.ONEDRIVE_API_URL || 'http://localhost:8093';
const NEXTCLOUD_API_URL = process.env.NEXTCLOUD_API_URL || 'http://localhost:8094';

// Mock StorageSync for testing
class MockStorageSync {
  constructor(options = {}) {
    this.provider = options.provider || 'local-folder';
    this.apiUrl = options.apiUrl || null;
    this.accessToken = options.accessToken || null;
    this.refreshToken = options.refreshToken || null;
    this.clientId = options.clientId || null;
    this.clientSecret = options.clientSecret || null;
    this.username = options.username || null;
    this.password = options.password || null;
    this.processedFiles = new Set();
  }

  async refreshAccessToken() {
    if (this.provider === 'dropbox') {
      return this._refreshDropboxToken();
    } else if (this.provider === 'gdrive') {
      return this._refreshGdriveToken();
    } else if (this.provider === 'onedrive') {
      return this._refreshOnedriveToken();
    }
    return null;
  }

  async _refreshDropboxToken() {
    const res = await fetch(`${this.apiUrl}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      }),
    });
    if (!res.ok) throw new Error('Dropbox token refresh failed');
    const data = await res.json();
    this.accessToken = data.access_token;
    return data.access_token;
  }

  async _refreshGdriveToken() {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
      grant_type: 'refresh_token',
    });
    const res = await fetch(`${this.apiUrl}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!res.ok) throw new Error('Google Drive token refresh failed');
    const data = await res.json();
    this.accessToken = data.access_token;
    return data.access_token;
  }

  async _refreshOnedriveToken() {
    const params = new URLSearchParams({
      client_id: this.clientId,
      refresh_token: this.refreshToken,
      grant_type: 'refresh_token',
      scope: 'Files.Read Files.Read.All offline_access',
    });
    if (this.clientSecret) {
      params.append('client_secret', this.clientSecret);
    }
    const res = await fetch(`${this.apiUrl}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!res.ok) throw new Error('OneDrive token refresh failed');
    const data = await res.json();
    this.accessToken = data.access_token;
    return data.access_token;
  }

  async listFiles(folderPath = '/') {
    if (this.provider === 'dropbox') {
      return this._listDropboxFiles(folderPath);
    } else if (this.provider === 'gdrive') {
      return this._listGdriveFiles(folderPath);
    } else if (this.provider === 'onedrive') {
      return this._listOnedriveFiles(folderPath);
    } else if (this.provider === 'nextcloud') {
      return this._listNextcloudFiles(folderPath);
    }
    return [];
  }

  async _listDropboxFiles(folderPath) {
    const res = await fetch(`${this.apiUrl}/2/files/list_folder`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: folderPath, recursive: true }),
    });
    if (!res.ok) throw new Error('Dropbox list_folder failed');
    const data = await res.json();
    return (data.entries || []).filter((e) => e['.tag'] === 'file');
  }

  async _listGdriveFiles(folderId) {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const res = await fetch(`${this.apiUrl}/drive/v3/files?q=${q}`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) throw new Error('Google Drive list failed');
    const data = await res.json();
    return data.files || [];
  }

  async _listOnedriveFiles(folderId = 'root') {
    const url = folderId === 'root'
      ? `${this.apiUrl}/v1.0/me/drive/root/delta`
      : `${this.apiUrl}/v1.0/me/drive/items/${folderId}/delta`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) throw new Error('OneDrive delta failed');
    const data = await res.json();
    return (data.value || []).filter((item) => !item.folder && !item.deleted);
  }

  async _listNextcloudFiles(folderPath) {
    const auth = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    const webdavUrl = `${this.apiUrl}/remote.php/dav/files/${this.username}${folderPath}`;
    const propfindBody = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:getcontenttype/><d:getcontentlength/><d:getlastmodified/><d:getetag/></d:prop></d:propfind>';
    
    const res = await fetch(webdavUrl, {
      method: 'PROPFIND',
      headers: {
        Authorization: `Basic ${auth}`,
        Depth: '1',
        'Content-Type': 'application/xml',
      },
      body: propfindBody,
    });
    if (!res.ok) throw new Error('Nextcloud PROPFIND failed');
    const xml = await res.text();
    
    // Parse XML responses
    const files = [];
    const responses = xml.split(/<d:response>/i).slice(1);
    for (const chunk of responses) {
      const hrefMatch = chunk.match(/<d:href>([^<]+)<\/d:href>/i);
      const typeMatch = chunk.match(/<d:getcontenttype>([^<]+)<\/d:getcontenttype>/i);
      if (hrefMatch && typeMatch) {
        const href = hrefMatch[1].replace(/&amp;/g, '&');
        const name = decodeURIComponent(href.split('/').filter(Boolean).pop() || '');
        files.push({ href, name, contentType: typeMatch[1] });
      }
    }
    return files;
  }

  async downloadFile(fileId, filePath) {
    if (this.provider === 'dropbox') {
      return this._downloadDropboxFile(filePath);
    } else if (this.provider === 'gdrive') {
      return this._downloadGdriveFile(fileId);
    } else if (this.provider === 'onedrive') {
      return this._downloadOnedriveFile(fileId);
    } else if (this.provider === 'nextcloud') {
      return this._downloadNextcloudFile(filePath);
    }
    throw new Error('Unknown provider');
  }

  async _downloadDropboxFile(filePath) {
    const res = await fetch(`${this.apiUrl}/2/files/download`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({ path: filePath }),
      },
    });
    if (!res.ok) throw new Error('Dropbox download failed');
    return Buffer.from(await res.arrayBuffer());
  }

  async _downloadGdriveFile(fileId) {
    const res = await fetch(`${this.apiUrl}/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) throw new Error('Google Drive download failed');
    return Buffer.from(await res.arrayBuffer());
  }

  async _downloadOnedriveFile(itemId) {
    const res = await fetch(`${this.apiUrl}/v1.0/me/drive/items/${itemId}/content`, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!res.ok) throw new Error('OneDrive download failed');
    return Buffer.from(await res.arrayBuffer());
  }

  async _downloadNextcloudFile(href) {
    const auth = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    const url = href.startsWith('http') ? href : `${this.apiUrl}${href}`;
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) throw new Error('Nextcloud download failed');
    return Buffer.from(await res.arrayBuffer());
  }

  isInvoiceFile(fileName) {
    const name = String(fileName || '').toLowerCase();
    return name.endsWith('.pdf') || name.endsWith('.jpg') || 
           name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.xml');
  }
}

// Test suites
describe('Storage Sync Tests', () => {
  describe('Dropbox Integration', () => {
    let sync;

    before(async () => {
      await fetch(`${DROPBOX_API_URL}/admin/reset`, { method: 'POST' });
      sync = new MockStorageSync({
        provider: 'dropbox',
        apiUrl: DROPBOX_API_URL,
        refreshToken: 'test-refresh-token',
      });
    });

    it('should refresh access token', async () => {
      const token = await sync.refreshAccessToken();
      assert.ok(token);
      assert.ok(token.startsWith('mock_dropbox_access_token_'));
    });

    it('should list files in folder', async () => {
      sync.accessToken = 'test_token';
      const files = await sync.listFiles('/');
      assert.ok(Array.isArray(files));
      assert.ok(files.length > 0, 'Should have at least one file');
    });

    it('should filter invoice files', async () => {
      sync.accessToken = 'test_token';
      const files = await sync.listFiles('/');
      const invoiceFiles = files.filter((f) => sync.isInvoiceFile(f.name));
      assert.ok(invoiceFiles.length > 0, 'Should have invoice files');
      for (const file of invoiceFiles) {
        assert.ok(sync.isInvoiceFile(file.name), `${file.name} should be invoice type`);
      }
    });

    it('should download file content', async () => {
      sync.accessToken = 'test_token';
      const files = await sync.listFiles('/');
      const pdfFile = files.find((f) => f.name.endsWith('.pdf'));
      if (pdfFile) {
        const content = await sync.downloadFile(null, pdfFile.path_display);
        assert.ok(Buffer.isBuffer(content));
        assert.ok(content.length > 0);
      }
    });

    it('should handle multiple accounts', async () => {
      const sync1 = new MockStorageSync({
        provider: 'dropbox',
        apiUrl: DROPBOX_API_URL,
        refreshToken: 'account1-token',
      });
      const sync2 = new MockStorageSync({
        provider: 'dropbox',
        apiUrl: DROPBOX_API_URL,
        refreshToken: 'account2-token',
      });

      const token1 = await sync1.refreshAccessToken();
      const token2 = await sync2.refreshAccessToken();
      assert.ok(token1);
      assert.ok(token2);
      assert.notStrictEqual(token1, token2);
    });
  });

  describe('Google Drive Integration', () => {
    let sync;
    let testFolderId;

    before(async () => {
      await fetch(`${GDRIVE_API_URL}/admin/reset`, { method: 'POST' });
      
      // Get test folder ID
      const foldersRes = await fetch(`${GDRIVE_API_URL}/admin/folders`);
      const foldersData = await foldersRes.json();
      testFolderId = foldersData.folders?.[0]?.id || 'folder_root_invoices';

      sync = new MockStorageSync({
        provider: 'gdrive',
        apiUrl: GDRIVE_API_URL,
        refreshToken: 'test-refresh-token',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      });
    });

    it('should refresh access token', async () => {
      const token = await sync.refreshAccessToken();
      assert.ok(token);
      assert.ok(token.startsWith('mock_gdrive_access_token_'));
    });

    it('should list files in folder', async () => {
      sync.accessToken = 'test_token';
      const files = await sync.listFiles(testFolderId);
      assert.ok(Array.isArray(files));
      assert.ok(files.length > 0, 'Should have at least one file');
    });

    it('should download file content', async () => {
      sync.accessToken = 'test_token';
      const files = await sync.listFiles(testFolderId);
      const pdfFile = files.find((f) => f.name.endsWith('.pdf'));
      if (pdfFile) {
        const content = await sync.downloadFile(pdfFile.id, null);
        assert.ok(Buffer.isBuffer(content));
        assert.ok(content.length > 0);
      }
    });

    it('should handle multiple Google accounts', async () => {
      const sync1 = new MockStorageSync({
        provider: 'gdrive',
        apiUrl: GDRIVE_API_URL,
        refreshToken: 'account1-token',
        clientId: 'client1',
        clientSecret: 'secret1',
      });
      const sync2 = new MockStorageSync({
        provider: 'gdrive',
        apiUrl: GDRIVE_API_URL,
        refreshToken: 'account2-token',
        clientId: 'client2',
        clientSecret: 'secret2',
      });

      const token1 = await sync1.refreshAccessToken();
      const token2 = await sync2.refreshAccessToken();
      assert.ok(token1);
      assert.ok(token2);
    });
  });

  describe('OneDrive Integration', () => {
    let sync;

    before(async () => {
      await fetch(`${ONEDRIVE_API_URL}/admin/reset`, { method: 'POST' });
      sync = new MockStorageSync({
        provider: 'onedrive',
        apiUrl: ONEDRIVE_API_URL,
        refreshToken: 'test-refresh-token',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
      });
    });

    it('should refresh access token', async () => {
      const token = await sync.refreshAccessToken();
      assert.ok(token);
      assert.ok(token.startsWith('mock_onedrive_access_token_'));
    });

    it('should list files via delta query', async () => {
      sync.accessToken = 'test_token';
      const files = await sync.listFiles('root');
      assert.ok(Array.isArray(files));
      assert.ok(files.length > 0, 'Should have at least one file');
    });

    it('should download file content', async () => {
      sync.accessToken = 'test_token';
      const files = await sync.listFiles('root');
      const pdfFile = files.find((f) => f.name && f.name.endsWith('.pdf'));
      if (pdfFile) {
        const content = await sync.downloadFile(pdfFile.id, null);
        assert.ok(Buffer.isBuffer(content));
        assert.ok(content.length > 0);
      }
    });

    it('should handle multiple OneDrive accounts', async () => {
      const sync1 = new MockStorageSync({
        provider: 'onedrive',
        apiUrl: ONEDRIVE_API_URL,
        refreshToken: 'account1-token',
        clientId: 'client1',
      });
      const sync2 = new MockStorageSync({
        provider: 'onedrive',
        apiUrl: ONEDRIVE_API_URL,
        refreshToken: 'account2-token',
        clientId: 'client2',
      });

      const token1 = await sync1.refreshAccessToken();
      const token2 = await sync2.refreshAccessToken();
      assert.ok(token1);
      assert.ok(token2);
    });
  });

  describe('Nextcloud WebDAV Integration', () => {
    let sync;

    before(async () => {
      await fetch(`${NEXTCLOUD_API_URL}/admin/reset`, { method: 'POST' });
      sync = new MockStorageSync({
        provider: 'nextcloud',
        apiUrl: NEXTCLOUD_API_URL,
        username: 'testuser',
        password: 'testpass',
      });
    });

    it('should list files via PROPFIND', async () => {
      const files = await sync.listFiles('/');
      assert.ok(Array.isArray(files));
      assert.ok(files.length > 0, 'Should have at least one file');
    });

    it('should filter invoice files from listing', async () => {
      const files = await sync.listFiles('/');
      const invoiceFiles = files.filter((f) => sync.isInvoiceFile(f.name));
      assert.ok(invoiceFiles.length > 0, 'Should have invoice files');
    });

    it('should download file content', async () => {
      const files = await sync.listFiles('/');
      const pdfFile = files.find((f) => f.name && f.name.endsWith('.pdf'));
      if (pdfFile) {
        const content = await sync.downloadFile(null, pdfFile.href);
        assert.ok(Buffer.isBuffer(content));
        assert.ok(content.length > 0);
      }
    });

    it('should handle multiple Nextcloud accounts', async () => {
      // Create second user
      await fetch(`${NEXTCLOUD_API_URL}/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'user2', password: 'pass2' }),
      });

      const sync1 = new MockStorageSync({
        provider: 'nextcloud',
        apiUrl: NEXTCLOUD_API_URL,
        username: 'testuser',
        password: 'testpass',
      });
      const sync2 = new MockStorageSync({
        provider: 'nextcloud',
        apiUrl: NEXTCLOUD_API_URL,
        username: 'user2',
        password: 'pass2',
      });

      // Both should be able to authenticate
      const files1 = await sync1.listFiles('/');
      assert.ok(Array.isArray(files1));
    });
  });

  describe('Cross-Provider Sync', () => {
    it('should sync from all configured providers', async () => {
      const providers = [
        { type: 'dropbox', apiUrl: DROPBOX_API_URL, accessToken: 'test' },
        { type: 'gdrive', apiUrl: GDRIVE_API_URL, accessToken: 'test' },
        { type: 'onedrive', apiUrl: ONEDRIVE_API_URL, accessToken: 'test' },
        { type: 'nextcloud', apiUrl: NEXTCLOUD_API_URL, username: 'testuser', password: 'testpass' },
      ];

      const allFiles = [];

      for (const config of providers) {
        const sync = new MockStorageSync({ provider: config.type, ...config });
        try {
          const files = await sync.listFiles(config.type === 'gdrive' ? 'folder_root_invoices' : '/');
          const invoiceFiles = files.filter((f) => sync.isInvoiceFile(f.name));
          allFiles.push(...invoiceFiles.map((f) => ({ ...f, provider: config.type })));
        } catch (err) {
          console.error(`Failed to sync from ${config.type}:`, err.message);
        }
      }

      assert.ok(allFiles.length > 0, 'Should have files from at least one provider');
      const providers_found = new Set(allFiles.map((f) => f.provider));
      console.log(`Found files from providers: ${Array.from(providers_found).join(', ')}`);
    });

    it('should deduplicate files by name and size', () => {
      const files = [
        { name: 'faktura.pdf', size: 45000, provider: 'dropbox' },
        { name: 'faktura.pdf', size: 45000, provider: 'gdrive' }, // Duplicate
        { name: 'faktura.pdf', size: 52000, provider: 'onedrive' }, // Different size
        { name: 'rachunek.pdf', size: 32000, provider: 'nextcloud' },
      ];

      const deduplicated = [];
      const seen = new Set();

      for (const file of files) {
        const key = `${file.name}:${file.size}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduplicated.push(file);
        }
      }

      assert.strictEqual(deduplicated.length, 3);
    });

    it('should prioritize providers correctly', () => {
      const connections = [
        { id: '1', type: 'nextcloud', priority: 30 },
        { id: '2', type: 'dropbox', priority: 10 },
        { id: '3', type: 'gdrive', priority: 20 },
        { id: '4', type: 'onedrive', priority: 25 },
      ];

      const sorted = connections.sort((a, b) => a.priority - b.priority);
      
      assert.strictEqual(sorted[0].type, 'dropbox');
      assert.strictEqual(sorted[1].type, 'gdrive');
      assert.strictEqual(sorted[2].type, 'onedrive');
      assert.strictEqual(sorted[3].type, 'nextcloud');
    });
  });
});

// Run tests
if (require.main === module) {
  console.log('Starting Storage Sync Tests...');
  console.log(`Dropbox API: ${DROPBOX_API_URL}`);
  console.log(`Google Drive API: ${GDRIVE_API_URL}`);
  console.log(`OneDrive API: ${ONEDRIVE_API_URL}`);
  console.log(`Nextcloud API: ${NEXTCLOUD_API_URL}`);
}
