const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8092;

// Mock data store
const mockFiles = new Map();
const mockFolders = new Map();

// Initialize with sample invoice files
function initializeMockData() {
  // Create folders
  const rootFolderId = 'folder_root_invoices';
  mockFolders.set(rootFolderId, {
    id: rootFolderId,
    name: 'Faktury',
    mimeType: 'application/vnd.google-apps.folder',
  });

  const sampleFiles = [
    {
      id: 'gdrive-file-' + uuidv4(),
      name: 'faktura_google_workspace.pdf',
      mimeType: 'application/pdf',
      size: 58000,
      modifiedTime: new Date().toISOString(),
      parents: [rootFolderId],
    },
    {
      id: 'gdrive-file-' + uuidv4(),
      name: 'rachunek_cloud_storage.pdf',
      mimeType: 'application/pdf',
      size: 42000,
      modifiedTime: new Date(Date.now() - 86400000).toISOString(),
      parents: [rootFolderId],
    },
    {
      id: 'gdrive-file-' + uuidv4(),
      name: 'skan_faktury_biuro.png',
      mimeType: 'image/png',
      size: 180000,
      modifiedTime: new Date(Date.now() - 172800000).toISOString(),
      parents: [rootFolderId],
    },
    {
      id: 'gdrive-file-' + uuidv4(),
      name: 'efaktura_ksef_import.xml',
      mimeType: 'application/xml',
      size: 12000,
      modifiedTime: new Date(Date.now() - 259200000).toISOString(),
      parents: [rootFolderId],
    },
  ];

  sampleFiles.forEach((file) => mockFiles.set(file.id, file));
}

initializeMockData();

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'gdrive-mock-api' });
});

// OAuth2 token refresh
app.post('/oauth2/token', (req, res) => {
  const grantType = req.body.grant_type;
  const refreshToken = req.body.refresh_token;
  
  if (grantType === 'refresh_token' && refreshToken) {
    res.json({
      access_token: 'mock_gdrive_access_token_' + Date.now(),
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'https://www.googleapis.com/auth/drive.readonly',
    });
  } else {
    res.status(400).json({ error: 'invalid_grant' });
  }
});

// List files
app.get('/drive/v3/files', (req, res) => {
  const { q, pageSize, pageToken, fields } = req.query;
  
  let files = Array.from(mockFiles.values());
  
  // Parse query for parent folder filter
  if (q) {
    const parentMatch = q.match(/'([^']+)'\s+in\s+parents/);
    if (parentMatch) {
      const parentId = parentMatch[1];
      files = files.filter((f) => f.parents && f.parents.includes(parentId));
    }
    
    // Filter by modifiedTime
    const modifiedMatch = q.match(/modifiedTime\s*>\s*'([^']+)'/);
    if (modifiedMatch) {
      const since = new Date(modifiedMatch[1]).getTime();
      files = files.filter((f) => new Date(f.modifiedTime).getTime() > since);
    }
    
    // Filter trashed
    if (q.includes('trashed=false')) {
      files = files.filter((f) => !f.trashed);
    }
  }
  
  const limit = parseInt(pageSize, 10) || 100;
  const limited = files.slice(0, limit);
  
  res.json({
    kind: 'drive#fileList',
    files: limited,
    nextPageToken: files.length > limit ? 'next_page_token' : undefined,
  });
});

// Get file metadata
app.get('/drive/v3/files/:fileId', (req, res) => {
  const { fileId } = req.params;
  const { alt } = req.query;
  
  const file = mockFiles.get(fileId);
  
  if (!file) {
    return res.status(404).json({
      error: {
        code: 404,
        message: 'File not found',
        errors: [{ domain: 'global', reason: 'notFound', message: 'File not found' }],
      },
    });
  }
  
  // Download content
  if (alt === 'media') {
    let content;
    if (file.mimeType === 'application/pdf') {
      content = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
    } else if (file.mimeType === 'application/xml') {
      content = Buffer.from('<?xml version="1.0"?><Faktura><Numer>FV/2024/002</Numer></Faktura>');
    } else {
      // Mock PNG header
      content = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    }
    
    res.setHeader('Content-Type', file.mimeType);
    res.send(content);
    return;
  }
  
  res.json(file);
});

// Admin endpoint: Add test file
app.post('/admin/files', (req, res) => {
  const file = {
    id: 'gdrive-file-' + uuidv4(),
    modifiedTime: new Date().toISOString(),
    parents: ['folder_root_invoices'],
    ...req.body,
  };
  
  mockFiles.set(file.id, file);
  res.status(201).json(file);
});

// Admin endpoint: Reset mock data
app.post('/admin/reset', (_req, res) => {
  mockFiles.clear();
  mockFolders.clear();
  initializeMockData();
  res.json({ ok: true, count: mockFiles.size });
});

// Admin endpoint: List all files
app.get('/admin/files', (_req, res) => {
  res.json({
    files: Array.from(mockFiles.values()),
    folders: Array.from(mockFolders.values()),
    count: mockFiles.size,
  });
});

// Admin endpoint: Get folder ID for testing
app.get('/admin/folders', (_req, res) => {
  res.json({
    folders: Array.from(mockFolders.values()),
  });
});

app.listen(PORT, () => {
  console.log(`Google Drive Mock API server running on port ${PORT}`);
  console.log(`Initialized with ${mockFiles.size} sample files`);
});
