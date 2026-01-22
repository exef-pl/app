const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8082;

// Mock data store
const mockEmails = new Map();
const mockFolders = new Map([
  ['inbox', { id: 'inbox', displayName: 'Inbox', parentFolderId: null }],
  ['sentitems', { id: 'sentitems', displayName: 'Sent Items', parentFolderId: null }],
  ['processed', { id: 'processed', displayName: 'Processed', parentFolderId: null }],
]);

// Initialize with sample invoice emails
function initializeMockData() {
  const sampleEmails = [
    {
      id: uuidv4(),
      createdDateTime: new Date().toISOString(),
      lastModifiedDateTime: new Date().toISOString(),
      receivedDateTime: new Date().toISOString(),
      sentDateTime: new Date().toISOString(),
      hasAttachments: true,
      subject: 'Faktura VAT FV/2024/002 - Microsoft 365',
      bodyPreview: 'W załączeniu przesyłamy fakturę za usługi Microsoft 365.',
      from: {
        emailAddress: { name: 'Microsoft', address: 'noreply@microsoft.com' },
      },
      toRecipients: [
        { emailAddress: { name: 'Test User', address: 'test@outlook.com' } },
      ],
      parentFolderId: 'inbox',
      isRead: false,
      attachments: [
        {
          id: 'att-' + uuidv4(),
          name: 'faktura_microsoft_365.pdf',
          contentType: 'application/pdf',
          size: 52000,
          isInline: false,
        },
      ],
    },
    {
      id: uuidv4(),
      createdDateTime: new Date(Date.now() - 86400000).toISOString(),
      lastModifiedDateTime: new Date(Date.now() - 86400000).toISOString(),
      receivedDateTime: new Date(Date.now() - 86400000).toISOString(),
      sentDateTime: new Date(Date.now() - 86400000).toISOString(),
      hasAttachments: true,
      subject: 'Rachunek za Azure - styczeń 2024',
      bodyPreview: 'Rachunek za usługi chmurowe Azure.',
      from: {
        emailAddress: { name: 'Azure Billing', address: 'azure-noreply@microsoft.com' },
      },
      toRecipients: [
        { emailAddress: { name: 'Test User', address: 'test@outlook.com' } },
      ],
      parentFolderId: 'inbox',
      isRead: false,
      attachments: [
        {
          id: 'att-' + uuidv4(),
          name: 'azure_invoice_jan2024.pdf',
          contentType: 'application/pdf',
          size: 78000,
          isInline: false,
        },
      ],
    },
    {
      id: uuidv4(),
      createdDateTime: new Date(Date.now() - 172800000).toISOString(),
      lastModifiedDateTime: new Date(Date.now() - 172800000).toISOString(),
      receivedDateTime: new Date(Date.now() - 172800000).toISOString(),
      sentDateTime: new Date(Date.now() - 172800000).toISOString(),
      hasAttachments: true,
      subject: 'Faktura za domenę - example.pl',
      bodyPreview: 'Faktura za odnowienie domeny.',
      from: {
        emailAddress: { name: 'Rejestrator', address: 'faktury@domena.pl' },
      },
      toRecipients: [
        { emailAddress: { name: 'Test User', address: 'test@outlook.com' } },
      ],
      parentFolderId: 'inbox',
      isRead: true,
      attachments: [
        {
          id: 'att-' + uuidv4(),
          name: 'faktura_domena_2024.png',
          contentType: 'image/png',
          size: 125000,
          isInline: false,
        },
      ],
    },
  ];

  sampleEmails.forEach((email) => mockEmails.set(email.id, email));
}

initializeMockData();

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'outlook-mock-api' });
});

// OAuth2 token endpoint (mock)
app.post('/oauth2/v2.0/token', (req, res) => {
  const { refresh_token, grant_type } = req.body;
  
  if (grant_type === 'refresh_token' && refresh_token) {
    res.json({
      access_token: 'mock_outlook_access_token_' + Date.now(),
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'Mail.Read Mail.ReadWrite',
    });
  } else {
    res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid refresh token' });
  }
});

// List messages (Microsoft Graph API style)
app.get('/v1.0/me/messages', (req, res) => {
  const { $filter, $top = 50, $select, $expand } = req.query;
  
  let messages = Array.from(mockEmails.values());
  
  // Filter by hasAttachments
  if ($filter && $filter.includes('hasAttachments eq true')) {
    messages = messages.filter((m) => m.hasAttachments);
  }
  
  // Filter by parentFolderId (inbox)
  if ($filter && $filter.includes("parentFolderId eq 'inbox'")) {
    messages = messages.filter((m) => m.parentFolderId === 'inbox');
  }
  
  // Filter by isRead
  if ($filter && $filter.includes('isRead eq false')) {
    messages = messages.filter((m) => !m.isRead);
  }
  
  const limited = messages.slice(0, parseInt($top, 10));
  
  // Include attachments if expanded
  const includeAttachments = $expand && $expand.includes('attachments');
  
  const result = limited.map((m) => {
    const item = { ...m };
    if (!includeAttachments) {
      delete item.attachments;
    }
    return item;
  });
  
  res.json({
    '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#users(\'me\')/messages',
    '@odata.count': result.length,
    value: result,
  });
});

// Get single message
app.get('/v1.0/me/messages/:messageId', (req, res) => {
  const { messageId } = req.params;
  
  const message = mockEmails.get(messageId);
  
  if (!message) {
    return res.status(404).json({
      error: {
        code: 'ErrorItemNotFound',
        message: 'The specified object was not found in the store.',
      },
    });
  }
  
  res.json(message);
});

// List message attachments
app.get('/v1.0/me/messages/:messageId/attachments', (req, res) => {
  const { messageId } = req.params;
  
  const message = mockEmails.get(messageId);
  
  if (!message) {
    return res.status(404).json({
      error: {
        code: 'ErrorItemNotFound',
        message: 'The specified object was not found in the store.',
      },
    });
  }
  
  res.json({
    '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#users(\'me\')/messages(\'' + messageId + '\')/attachments',
    value: message.attachments || [],
  });
});

// Get attachment content
app.get('/v1.0/me/messages/:messageId/attachments/:attachmentId', (req, res) => {
  const { messageId, attachmentId } = req.params;
  
  const message = mockEmails.get(messageId);
  if (!message) {
    return res.status(404).json({
      error: {
        code: 'ErrorItemNotFound',
        message: 'Message not found.',
      },
    });
  }
  
  const attachment = (message.attachments || []).find((a) => a.id === attachmentId);
  if (!attachment) {
    return res.status(404).json({
      error: {
        code: 'ErrorItemNotFound',
        message: 'Attachment not found.',
      },
    });
  }
  
  // Generate mock content based on content type
  let mockContent;
  if (attachment.contentType === 'application/pdf') {
    mockContent = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
  } else {
    // Mock image content (tiny PNG)
    mockContent = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    ]);
  }
  
  res.json({
    '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#users(\'me\')/messages(\'' + messageId + '\')/attachments/$entity',
    '@odata.type': '#microsoft.graph.fileAttachment',
    id: attachment.id,
    name: attachment.name,
    contentType: attachment.contentType,
    size: mockContent.length,
    contentBytes: mockContent.toString('base64'),
  });
});

// Move message to folder
app.post('/v1.0/me/messages/:messageId/move', (req, res) => {
  const { messageId } = req.params;
  const { destinationId } = req.body;
  
  const message = mockEmails.get(messageId);
  if (!message) {
    return res.status(404).json({
      error: {
        code: 'ErrorItemNotFound',
        message: 'Message not found.',
      },
    });
  }
  
  message.parentFolderId = destinationId;
  mockEmails.set(messageId, message);
  
  res.json(message);
});

// Update message (mark as read, etc.)
app.patch('/v1.0/me/messages/:messageId', (req, res) => {
  const { messageId } = req.params;
  const updates = req.body;
  
  const message = mockEmails.get(messageId);
  if (!message) {
    return res.status(404).json({
      error: {
        code: 'ErrorItemNotFound',
        message: 'Message not found.',
      },
    });
  }
  
  Object.assign(message, updates, { lastModifiedDateTime: new Date().toISOString() });
  mockEmails.set(messageId, message);
  
  res.json(message);
});

// List mail folders
app.get('/v1.0/me/mailFolders', (req, res) => {
  res.json({
    '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#users(\'me\')/mailFolders',
    value: Array.from(mockFolders.values()),
  });
});

// Create mail folder
app.post('/v1.0/me/mailFolders', (req, res) => {
  const { displayName, parentFolderId } = req.body;
  
  const folder = {
    id: displayName.toLowerCase().replace(/\s+/g, ''),
    displayName,
    parentFolderId: parentFolderId || null,
  };
  
  mockFolders.set(folder.id, folder);
  res.status(201).json(folder);
});

// Admin endpoint: Add test email
app.post('/admin/emails', (req, res) => {
  const email = {
    id: uuidv4(),
    createdDateTime: new Date().toISOString(),
    lastModifiedDateTime: new Date().toISOString(),
    receivedDateTime: new Date().toISOString(),
    sentDateTime: new Date().toISOString(),
    parentFolderId: 'inbox',
    isRead: false,
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
  console.log(`Outlook Mock API server running on port ${PORT}`);
  console.log(`Initialized with ${mockEmails.size} sample emails`);
});
