const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8091;

// Mock data store
const mockFiles = new Map();
const mockCursors = new Map();

// Initialize with sample invoice files
function initializeMockData() {
  const sampleFiles = [
    {
      '.tag': 'file',
      id: 'id:dropbox-file-' + uuidv4(),
      name: 'faktura_FV_2024_001.pdf',
      path_display: '/Faktury/faktura_FV_2024_001.pdf',
      path_lower: '/faktury/faktura_fv_2024_001.pdf',
      size: 45000,
      server_modified: new Date().toISOString(),
      content_hash: 'hash_' + uuidv4(),
    },
    {
      '.tag': 'file',
      id: 'id:dropbox-file-' + uuidv4(),
      name: 'rachunek_hosting_2024.pdf',
      path_display: '/Faktury/rachunek_hosting_2024.pdf',
      path_lower: '/faktury/rachunek_hosting_2024.pdf',
      size: 32000,
      server_modified: new Date(Date.now() - 86400000).toISOString(),
      content_hash: 'hash_' + uuidv4(),
    },
    {
      '.tag': 'file',
      id: 'id:dropbox-file-' + uuidv4(),
      name: 'skan_paragonu.jpg',
      path_display: '/Paragony/skan_paragonu.jpg',
      path_lower: '/paragony/skan_paragonu.jpg',
      size: 150000,
      server_modified: new Date(Date.now() - 172800000).toISOString(),
      content_hash: 'hash_' + uuidv4(),
    },
    {
      '.tag': 'file',
      id: 'id:dropbox-file-' + uuidv4(),
      name: 'faktura_ksef.xml',
      path_display: '/KSeF/faktura_ksef.xml',
      path_lower: '/ksef/faktura_ksef.xml',
      size: 8500,
      server_modified: new Date(Date.now() - 259200000).toISOString(),
      content_hash: 'hash_' + uuidv4(),
    },
  ];

  sampleFiles.forEach((file) => mockFiles.set(file.id, file));
}

initializeMockData();

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'dropbox-mock-api' });
});

// OAuth2 token refresh
app.post('/oauth2/token', (req, res) => {
  const { refresh_token, grant_type } = req.body;
  
  if (grant_type === 'refresh_token' && refresh_token) {
    res.json({
      access_token: 'mock_dropbox_access_token_' + Date.now(),
      expires_in: 14400,
      token_type: 'bearer',
    });
  } else {
    res.status(400).json({ error: 'invalid_grant' });
  }
});

// List folder
app.post('/2/files/list_folder', (req, res) => {
  const { path, recursive } = req.body;
  const normalizedPath = String(path || '').toLowerCase();
  
  let files = Array.from(mockFiles.values());
  
  // Filter by path
  if (normalizedPath && normalizedPath !== '') {
    files = files.filter((f) => {
      const filePath = String(f.path_lower || '');
      return filePath.startsWith(normalizedPath + '/') || 
             (recursive && filePath.includes(normalizedPath));
    });
  }
  
  const cursor = 'cursor_' + uuidv4();
  mockCursors.set(cursor, { files: [], has_more: false });
  
  res.json({
    entries: files,
    cursor: cursor,
    has_more: false,
  });
});

// List folder continue
app.post('/2/files/list_folder/continue', (req, res) => {
  const { cursor } = req.body;
  
  const cursorData = mockCursors.get(cursor);
  if (!cursorData) {
    return res.status(400).json({
      error_summary: 'path/not_found/.',
      error: { '.tag': 'path', 'path': { '.tag': 'not_found' } },
    });
  }
  
  res.json({
    entries: cursorData.files || [],
    cursor: cursor,
    has_more: cursorData.has_more || false,
  });
});

// Download file
app.post('/2/files/download', (req, res) => {
  const apiArg = req.headers['dropbox-api-arg'];
  let filePath = '';
  
  try {
    const parsed = JSON.parse(apiArg || '{}');
    filePath = String(parsed.path || '').toLowerCase();
  } catch (e) {
    return res.status(400).json({ error: 'invalid_api_arg' });
  }
  
  const file = Array.from(mockFiles.values()).find(
    (f) => f.path_lower === filePath || f.path_display === filePath || f.id === filePath
  );
  
  if (!file) {
    return res.status(409).json({
      error_summary: 'path/not_found/.',
      error: { '.tag': 'path', 'path': { '.tag': 'not_found' } },
    });
  }
  
  // Generate mock content based on file type
  let content;
  if (file.name.endsWith('.pdf')) {
    content = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
  } else if (file.name.endsWith('.xml')) {
    content = Buffer.from('<?xml version="1.0"?><Faktura><Numer>FV/2024/001</Numer></Faktura>');
  } else {
    // Mock image (tiny JPEG header)
    content = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
  }
  
  res.setHeader('Dropbox-API-Result', JSON.stringify({
    id: file.id,
    name: file.name,
    path_display: file.path_display,
    size: content.length,
    server_modified: file.server_modified,
  }));
  res.setHeader('Content-Type', 'application/octet-stream');
  res.send(content);
});

// Get file metadata
app.post('/2/files/get_metadata', (req, res) => {
  const { path } = req.body;
  const normalizedPath = String(path || '').toLowerCase();
  
  const file = Array.from(mockFiles.values()).find(
    (f) => f.path_lower === normalizedPath || f.id === path
  );
  
  if (!file) {
    return res.status(409).json({
      error_summary: 'path/not_found/.',
      error: { '.tag': 'path', 'path': { '.tag': 'not_found' } },
    });
  }
  
  res.json(file);
});

// Admin endpoint: Add test file
app.post('/admin/files', (req, res) => {
  const file = {
    '.tag': 'file',
    id: 'id:dropbox-file-' + uuidv4(),
    server_modified: new Date().toISOString(),
    content_hash: 'hash_' + uuidv4(),
    ...req.body,
  };
  
  if (!file.path_lower && file.path_display) {
    file.path_lower = file.path_display.toLowerCase();
  }
  
  mockFiles.set(file.id, file);
  res.status(201).json(file);
});

// Admin endpoint: Reset mock data
app.post('/admin/reset', (_req, res) => {
  mockFiles.clear();
  mockCursors.clear();
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
  console.log(`Dropbox Mock API server running on port ${PORT}`);
  console.log(`Initialized with ${mockFiles.size} sample files`);
});
