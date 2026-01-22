const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.text({ type: '*/*', limit: '10mb' }));
app.use(express.json());

const PORT = process.env.PORT || 8094;

// Mock data store
const mockFiles = new Map();
const mockUsers = new Map([
  ['testuser', { password: 'testpass', displayName: 'Test User' }],
  ['admin', { password: 'adminpass', displayName: 'Administrator' }],
]);

// Initialize with sample invoice files
function initializeMockData() {
  const baseHref = '/remote.php/dav/files/testuser';
  
  const sampleFiles = [
    {
      href: `${baseHref}/Faktury/faktura_nextcloud_2024.pdf`,
      name: 'faktura_nextcloud_2024.pdf',
      contentType: 'application/pdf',
      contentLength: 47000,
      lastModified: new Date().toUTCString(),
      etag: '"etag_' + uuidv4() + '"',
    },
    {
      href: `${baseHref}/Faktury/rachunek_hosting_nc.pdf`,
      name: 'rachunek_hosting_nc.pdf',
      contentType: 'application/pdf',
      contentLength: 35000,
      lastModified: new Date(Date.now() - 86400000).toUTCString(),
      etag: '"etag_' + uuidv4() + '"',
    },
    {
      href: `${baseHref}/Dokumenty/skan_faktury_biuro.jpg`,
      name: 'skan_faktury_biuro.jpg',
      contentType: 'image/jpeg',
      contentLength: 142000,
      lastModified: new Date(Date.now() - 172800000).toUTCString(),
      etag: '"etag_' + uuidv4() + '"',
    },
    {
      href: `${baseHref}/KSeF/faktura_ksef_nc.xml`,
      name: 'faktura_ksef_nc.xml',
      contentType: 'application/xml',
      contentLength: 11500,
      lastModified: new Date(Date.now() - 259200000).toUTCString(),
      etag: '"etag_' + uuidv4() + '"',
    },
  ];

  sampleFiles.forEach((file) => mockFiles.set(file.href, file));
}

initializeMockData();

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'nextcloud-mock-api' });
});

// Basic auth middleware
function checkAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Nextcloud"');
    return res.status(401).send('Authentication required');
  }
  
  const base64 = authHeader.slice(6);
  const decoded = Buffer.from(base64, 'base64').toString('utf8');
  const [username, password] = decoded.split(':');
  
  const user = mockUsers.get(username);
  if (!user || user.password !== password) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Nextcloud"');
    return res.status(401).send('Invalid credentials');
  }
  
  req.ncUser = username;
  next();
}

// WebDAV PROPFIND handler
app.propfind = app.propfind || function(path, ...handlers) {
  app.use(path, (req, res, next) => {
    if (req.method === 'PROPFIND') {
      const [handler] = handlers.slice(-1);
      handler(req, res, next);
    } else {
      next();
    }
  });
};

// Handle PROPFIND requests
app.use('/remote.php/dav/files/:username', checkAuth, (req, res, next) => {
  if (req.method !== 'PROPFIND') {
    return next();
  }
  
  const { username } = req.params;
  const requestPath = req.path || '/';
  const basePath = `/remote.php/dav/files/${username}`;
  const fullPath = basePath + (requestPath === '/' ? '' : requestPath);
  const depth = req.headers.depth || '1';
  
  // Find matching files
  let matchingFiles = [];
  
  if (depth === '0') {
    // Just the folder itself
    const file = mockFiles.get(fullPath);
    if (file) {
      matchingFiles = [file];
    }
  } else {
    // Folder contents
    matchingFiles = Array.from(mockFiles.values()).filter((f) => {
      const filePath = f.href;
      if (depth === '1') {
        // Direct children only
        const relativePath = filePath.replace(fullPath, '');
        return filePath.startsWith(fullPath) && 
               relativePath.split('/').filter(Boolean).length === 1;
      }
      // Depth infinity or unspecified
      return filePath.startsWith(fullPath);
    });
  }
  
  // Build WebDAV XML response
  let xml = '<?xml version="1.0" encoding="utf-8"?>\n';
  xml += '<d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">\n';
  
  // Add folder response
  xml += `  <d:response>\n`;
  xml += `    <d:href>${fullPath}/</d:href>\n`;
  xml += `    <d:propstat>\n`;
  xml += `      <d:prop>\n`;
  xml += `        <d:resourcetype><d:collection/></d:resourcetype>\n`;
  xml += `      </d:prop>\n`;
  xml += `      <d:status>HTTP/1.1 200 OK</d:status>\n`;
  xml += `    </d:propstat>\n`;
  xml += `  </d:response>\n`;
  
  // Add file responses
  for (const file of matchingFiles) {
    xml += `  <d:response>\n`;
    xml += `    <d:href>${file.href}</d:href>\n`;
    xml += `    <d:propstat>\n`;
    xml += `      <d:prop>\n`;
    xml += `        <d:getcontenttype>${file.contentType}</d:getcontenttype>\n`;
    xml += `        <d:getcontentlength>${file.contentLength}</d:getcontentlength>\n`;
    xml += `        <d:getlastmodified>${file.lastModified}</d:getlastmodified>\n`;
    xml += `        <d:getetag>${file.etag}</d:getetag>\n`;
    xml += `      </d:prop>\n`;
    xml += `      <d:status>HTTP/1.1 200 OK</d:status>\n`;
    xml += `    </d:propstat>\n`;
    xml += `  </d:response>\n`;
  }
  
  xml += '</d:multistatus>';
  
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.status(207).send(xml);
});

// Handle GET requests (file download)
app.get('/remote.php/dav/files/:username/*', checkAuth, (req, res) => {
  const { username } = req.params;
  const filePath = `/remote.php/dav/files/${username}/${req.params[0]}`;
  
  const file = mockFiles.get(filePath);
  if (!file) {
    return res.status(404).send('File not found');
  }
  
  let content;
  if (file.contentType === 'application/pdf') {
    content = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
  } else if (file.contentType === 'application/xml') {
    content = Buffer.from('<?xml version="1.0"?><Faktura><Numer>FV/2024/NC001</Numer></Faktura>');
  } else if (file.contentType.startsWith('image/jpeg')) {
    content = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
  } else {
    content = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  }
  
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('ETag', file.etag);
  res.setHeader('Last-Modified', file.lastModified);
  res.send(content);
});

// OCS API for user info
app.get('/ocs/v1.php/cloud/user', checkAuth, (req, res) => {
  const user = mockUsers.get(req.ncUser);
  res.json({
    ocs: {
      meta: { status: 'ok', statuscode: 100 },
      data: {
        id: req.ncUser,
        displayname: user?.displayName || req.ncUser,
        email: `${req.ncUser}@nextcloud.local`,
      },
    },
  });
});

// Admin endpoint: Add test file
app.post('/admin/files', (req, res) => {
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const file = {
    href: body.href || `/remote.php/dav/files/testuser/${body.name || 'file_' + Date.now() + '.pdf'}`,
    name: body.name || 'file_' + Date.now() + '.pdf',
    contentType: body.contentType || 'application/pdf',
    contentLength: body.contentLength || 10000,
    lastModified: new Date().toUTCString(),
    etag: '"etag_' + uuidv4() + '"',
    ...body,
  };
  
  mockFiles.set(file.href, file);
  res.status(201).json(file);
});

// Admin endpoint: Reset mock data
app.post('/admin/reset', (_req, res) => {
  mockFiles.clear();
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

// Admin endpoint: Add user
app.post('/admin/users', (req, res) => {
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { username, password, displayName } = body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }
  
  mockUsers.set(username, { password, displayName: displayName || username });
  res.status(201).json({ ok: true, username });
});

app.listen(PORT, () => {
  console.log(`Nextcloud Mock API server running on port ${PORT}`);
  console.log(`Initialized with ${mockFiles.size} sample files`);
});
