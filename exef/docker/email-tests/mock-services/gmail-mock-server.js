const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8081;

// Mock data store
const mockEmails = new Map();
const mockLabels = new Map([
  ['INBOX', { id: 'INBOX', name: 'INBOX', type: 'system' }],
  ['SENT', { id: 'SENT', name: 'SENT', type: 'system' }],
  ['PROCESSED', { id: 'Label_processed', name: 'processed', type: 'user' }],
]);

// Initialize with sample invoice emails
function initializeMockData() {
  const sampleEmails = [
    {
      id: uuidv4(),
      threadId: uuidv4(),
      labelIds: ['INBOX'],
      snippet: 'Faktura VAT nr FV/2024/001 za usługi IT',
      payload: {
        headers: [
          { name: 'From', value: 'faktury@firma.pl' },
          { name: 'To', value: 'test@example.com' },
          { name: 'Subject', value: 'Faktura VAT FV/2024/001' },
          { name: 'Date', value: new Date().toISOString() },
        ],
        mimeType: 'multipart/mixed',
        parts: [
          {
            mimeType: 'text/plain',
            body: { data: Buffer.from('W załączeniu faktura VAT').toString('base64') },
          },
          {
            filename: 'faktura_FV_2024_001.pdf',
            mimeType: 'application/pdf',
            body: {
              attachmentId: 'att-' + uuidv4(),
              size: 45000,
            },
          },
        ],
      },
      internalDate: String(Date.now()),
    },
    {
      id: uuidv4(),
      threadId: uuidv4(),
      labelIds: ['INBOX'],
      snippet: 'Rachunek za usługi hostingowe',
      payload: {
        headers: [
          { name: 'From', value: 'rozliczenia@hosting.pl' },
          { name: 'To', value: 'test@example.com' },
          { name: 'Subject', value: 'Rachunek nr R/2024/0042' },
          { name: 'Date', value: new Date(Date.now() - 86400000).toISOString() },
        ],
        mimeType: 'multipart/mixed',
        parts: [
          {
            mimeType: 'text/plain',
            body: { data: Buffer.from('Rachunek w załączniku').toString('base64') },
          },
          {
            filename: 'rachunek_2024_0042.pdf',
            mimeType: 'application/pdf',
            body: {
              attachmentId: 'att-' + uuidv4(),
              size: 32000,
            },
          },
        ],
      },
      internalDate: String(Date.now() - 86400000),
    },
    {
      id: uuidv4(),
      threadId: uuidv4(),
      labelIds: ['INBOX'],
      snippet: 'Skan faktury ze sklepu',
      payload: {
        headers: [
          { name: 'From', value: 'skaner@biuro.local' },
          { name: 'To', value: 'test@example.com' },
          { name: 'Subject', value: 'Skan dokumentu' },
          { name: 'Date', value: new Date(Date.now() - 172800000).toISOString() },
        ],
        mimeType: 'multipart/mixed',
        parts: [
          {
            mimeType: 'text/plain',
            body: { data: Buffer.from('Zeskanowany dokument').toString('base64') },
          },
          {
            filename: 'skan_faktura.jpg',
            mimeType: 'image/jpeg',
            body: {
              attachmentId: 'att-' + uuidv4(),
              size: 150000,
            },
          },
        ],
      },
      internalDate: String(Date.now() - 172800000),
    },
  ];

  sampleEmails.forEach((email) => mockEmails.set(email.id, email));
}

initializeMockData();

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'gmail-mock-api' });
});

// OAuth2 token endpoint (mock)
app.post('/oauth2/v4/token', (req, res) => {
  const { refresh_token, grant_type } = req.body;
  
  if (grant_type === 'refresh_token' && refresh_token) {
    res.json({
      access_token: 'mock_access_token_' + Date.now(),
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'https://www.googleapis.com/auth/gmail.readonly',
    });
  } else {
    res.status(400).json({ error: 'invalid_grant' });
  }
});

// List messages
app.get('/gmail/v1/users/:userId/messages', (req, res) => {
  const { q, labelIds, maxResults = 100 } = req.query;
  
  let messages = Array.from(mockEmails.values());
  
  // Filter by label
  if (labelIds) {
    const labels = Array.isArray(labelIds) ? labelIds : [labelIds];
    messages = messages.filter((m) => 
      m.labelIds.some((l) => labels.includes(l))
    );
  }
  
  // Filter by query (simple has:attachment support)
  if (q && q.includes('has:attachment')) {
    messages = messages.filter((m) => 
      m.payload?.parts?.some((p) => p.filename)
    );
  }
  
  const limited = messages.slice(0, parseInt(maxResults, 10));
  
  res.json({
    messages: limited.map((m) => ({ id: m.id, threadId: m.threadId })),
    resultSizeEstimate: limited.length,
  });
});

// Get message
app.get('/gmail/v1/users/:userId/messages/:messageId', (req, res) => {
  const { messageId } = req.params;
  const { format = 'full' } = req.query;
  
  const message = mockEmails.get(messageId);
  
  if (!message) {
    return res.status(404).json({ error: { code: 404, message: 'Not Found' } });
  }
  
  if (format === 'metadata') {
    return res.json({
      id: message.id,
      threadId: message.threadId,
      labelIds: message.labelIds,
      snippet: message.snippet,
      payload: {
        headers: message.payload.headers,
      },
    });
  }
  
  res.json(message);
});

// Get attachment
app.get('/gmail/v1/users/:userId/messages/:messageId/attachments/:attachmentId', (req, res) => {
  const { messageId, attachmentId } = req.params;
  
  const message = mockEmails.get(messageId);
  if (!message) {
    return res.status(404).json({ error: { code: 404, message: 'Message Not Found' } });
  }
  
  // Generate mock PDF content
  const mockPdfContent = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
  
  res.json({
    attachmentId,
    size: mockPdfContent.length,
    data: mockPdfContent.toString('base64'),
  });
});

// Modify message labels
app.post('/gmail/v1/users/:userId/messages/:messageId/modify', (req, res) => {
  const { messageId } = req.params;
  const { addLabelIds = [], removeLabelIds = [] } = req.body;
  
  const message = mockEmails.get(messageId);
  if (!message) {
    return res.status(404).json({ error: { code: 404, message: 'Not Found' } });
  }
  
  // Remove labels
  message.labelIds = message.labelIds.filter((l) => !removeLabelIds.includes(l));
  
  // Add labels
  addLabelIds.forEach((labelId) => {
    if (!message.labelIds.includes(labelId)) {
      message.labelIds.push(labelId);
    }
  });
  
  mockEmails.set(messageId, message);
  
  res.json(message);
});

// List labels
app.get('/gmail/v1/users/:userId/labels', (req, res) => {
  res.json({
    labels: Array.from(mockLabels.values()),
  });
});

// Create label
app.post('/gmail/v1/users/:userId/labels', (req, res) => {
  const { name, labelListVisibility, messageListVisibility } = req.body;
  
  const label = {
    id: 'Label_' + name.toLowerCase().replace(/\s+/g, '_'),
    name,
    type: 'user',
    labelListVisibility: labelListVisibility || 'labelShow',
    messageListVisibility: messageListVisibility || 'show',
  };
  
  mockLabels.set(label.id, label);
  res.status(201).json(label);
});

// Admin endpoint: Add test email
app.post('/admin/emails', (req, res) => {
  const email = {
    id: uuidv4(),
    threadId: uuidv4(),
    labelIds: ['INBOX'],
    internalDate: String(Date.now()),
    ...req.body,
  };
  
  mockEmails.set(email.id, email);
  res.status(201).json(email);
});

// Admin endpoint: Reset mock data
app.post('/admin/reset', (_req, res) => {
  mockEmails.clear();
  initializeMockData();
  res.json({ ok: true, count: mockEmails.size });
});

// Admin endpoint: List all emails (for debugging)
app.get('/admin/emails', (_req, res) => {
  res.json({
    emails: Array.from(mockEmails.values()),
    count: mockEmails.size,
  });
});

app.listen(PORT, () => {
  console.log(`Gmail Mock API server running on port ${PORT}`);
  console.log(`Initialized with ${mockEmails.size} sample emails`);
});
