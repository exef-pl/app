const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8093;

// Mock data store
const mockFiles = new Map();
const mockDeltaTokens = new Map();

// Initialize with sample invoice files
function initializeMockData() {
  const rootId = 'root';
  const invoicesFolderId = 'folder-invoices-' + uuidv4();
  
  const sampleFiles = [
    {
      id: invoicesFolderId,
      name: 'Faktury',
      folder: {},
      parentReference: { id: rootId, path: '/drive/root:' },
      lastModifiedDateTime: new Date().toISOString(),
    },
    {
      id: 'onedrive-file-' + uuidv4(),
      name: 'faktura_microsoft_365.pdf',
      file: { mimeType: 'application/pdf' },
      size: 52000,
      parentReference: { id: invoicesFolderId, path: '/drive/root:/Faktury' },
      lastModifiedDateTime: new Date().toISOString(),
      eTag: 'etag_' + uuidv4(),
      webUrl: 'https://onedrive.live.com/view/faktura_microsoft_365.pdf',
    },
    {
      id: 'onedrive-file-' + uuidv4(),
      name: 'rachunek_azure_jan2024.pdf',
      file: { mimeType: 'application/pdf' },
      size: 78000,
      parentReference: { id: invoicesFolderId, path: '/drive/root:/Faktury' },
      lastModifiedDateTime: new Date(Date.now() - 86400000).toISOString(),
      eTag: 'etag_' + uuidv4(),
      webUrl: 'https://onedrive.live.com/view/rachunek_azure_jan2024.pdf',
    },
    {
      id: 'onedrive-file-' + uuidv4(),
      name: 'skan_faktury_office.png',
      file: { mimeType: 'image/png' },
      size: 165000,
      parentReference: { id: invoicesFolderId, path: '/drive/root:/Faktury' },
      lastModifiedDateTime: new Date(Date.now() - 172800000).toISOString(),
      eTag: 'etag_' + uuidv4(),
      webUrl: 'https://onedrive.live.com/view/skan_faktury_office.png',
    },
    {
      id: 'onedrive-file-' + uuidv4(),
      name: 'faktura_ksef_export.xml',
      file: { mimeType: 'application/xml' },
      size: 9800,
      parentReference: { id: invoicesFolderId, path: '/drive/root:/Faktury' },
      lastModifiedDateTime: new Date(Date.now() - 259200000).toISOString(),
      eTag: 'etag_' + uuidv4(),
      webUrl: 'https://onedrive.live.com/view/faktura_ksef_export.xml',
    },
  ];

  sampleFiles.forEach((file) => mockFiles.set(file.id, file));
}

initializeMockData();

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'onedrive-mock-api' });
});

// OAuth2 token refresh (Microsoft identity platform)
app.post('/oauth2/v2.0/token', (req, res) => {
  const grantType = req.body.grant_type;
  const refreshToken = req.body.refresh_token;
  
  if (grantType === 'refresh_token' && refreshToken) {
    res.json({
      access_token: 'mock_onedrive_access_token_' + Date.now(),
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'Files.Read Files.Read.All offline_access',
      refresh_token: refreshToken,
    });
  } else {
    res.status(400).json({
      error: 'invalid_grant',
      error_description: 'The provided refresh token is invalid.',
    });
  }
});

// Delta query - root
app.get('/v1.0/me/drive/root/delta', (req, res) => {
  handleDelta(req, res, 'root');
});

// Delta query - specific folder
app.get('/v1.0/me/drive/items/:itemId/delta', (req, res) => {
  const { itemId } = req.params;
  handleDelta(req, res, itemId);
});

// Delta query - specific drive
app.get('/v1.0/drives/:driveId/root/delta', (req, res) => {
  handleDelta(req, res, 'root');
});

app.get('/v1.0/drives/:driveId/items/:itemId/delta', (req, res) => {
  const { itemId } = req.params;
  handleDelta(req, res, itemId);
});

function handleDelta(req, res, folderId) {
  let files = Array.from(mockFiles.values());
  
  // Filter to files (not folders) that are invoice types
  files = files.filter((f) => {
    if (f.folder) return false;
    const name = String(f.name || '').toLowerCase();
    return name.endsWith('.pdf') || name.endsWith('.jpg') || 
           name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.xml');
  });
  
  const deltaToken = 'delta_token_' + Date.now();
  mockDeltaTokens.set(deltaToken, { timestamp: Date.now() });
  
  res.json({
    '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#Collection(driveItem)',
    '@odata.deltaLink': `http://localhost:${PORT}/v1.0/me/drive/root/delta?token=${deltaToken}`,
    value: files,
  });
}

// Get item
app.get('/v1.0/me/drive/items/:itemId', (req, res) => {
  const { itemId } = req.params;
  
  const file = mockFiles.get(itemId);
  if (!file) {
    return res.status(404).json({
      error: {
        code: 'itemNotFound',
        message: 'The specified item was not found.',
      },
    });
  }
  
  res.json(file);
});

// Download content
app.get('/v1.0/me/drive/items/:itemId/content', (req, res) => {
  const { itemId } = req.params;
  
  const file = mockFiles.get(itemId);
  if (!file || file.folder) {
    return res.status(404).json({
      error: {
        code: 'itemNotFound',
        message: 'The specified item was not found.',
      },
    });
  }
  
  let content;
  const mimeType = file.file?.mimeType || 'application/octet-stream';
  
  if (mimeType === 'application/pdf') {
    content = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
  } else if (mimeType === 'application/xml') {
    content = Buffer.from('<?xml version="1.0"?><Faktura><Numer>FV/2024/003</Numer></Faktura>');
  } else {
    // Mock PNG header
    content = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  }
  
  res.setHeader('Content-Type', mimeType);
  res.send(content);
});

// Download from specific drive
app.get('/v1.0/drives/:driveId/items/:itemId/content', (req, res) => {
  const { itemId } = req.params;
  
  const file = mockFiles.get(itemId);
  if (!file || file.folder) {
    return res.status(404).json({
      error: {
        code: 'itemNotFound',
        message: 'The specified item was not found.',
      },
    });
  }
  
  let content;
  const mimeType = file.file?.mimeType || 'application/octet-stream';
  
  if (mimeType === 'application/pdf') {
    content = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
  } else if (mimeType === 'application/xml') {
    content = Buffer.from('<?xml version="1.0"?><Faktura><Numer>FV/2024/003</Numer></Faktura>');
  } else {
    content = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  }
  
  res.setHeader('Content-Type', mimeType);
  res.send(content);
});

// Admin endpoint: Add test file
app.post('/admin/files', (req, res) => {
  const file = {
    id: 'onedrive-file-' + uuidv4(),
    lastModifiedDateTime: new Date().toISOString(),
    eTag: 'etag_' + uuidv4(),
    ...req.body,
  };
  
  mockFiles.set(file.id, file);
  res.status(201).json(file);
});

// Admin endpoint: Reset mock data
app.post('/admin/reset', (_req, res) => {
  mockFiles.clear();
  mockDeltaTokens.clear();
  initializeMockData();
  res.json({ ok: true, count: mockFiles.size });
});

// Admin endpoint: List all files
app.get('/admin/files', (_req, res) => {
  res.json({
    files: Array.from(mockFiles.values()),
    count: mockFiles.size,
  });
});

app.listen(PORT, () => {
  console.log(`OneDrive Mock API server running on port ${PORT}`);
  console.log(`Initialized with ${mockFiles.size} sample files`);
});
