const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const tls = require('node:tls')
const dotenv = require('dotenv')

if (!process.env.EXEF_ENV_FILE && process.env.NODE_ENV === 'test') {
  try {
    if (!fs.existsSync('.env') && fs.existsSync('.env.test')) {
      fs.copyFileSync('.env.test', '.env')
    }
  } catch (_e) {
  }
}

const envFile = process.env.EXEF_ENV_FILE || (
  process.env.NODE_ENV === 'test' && fs.existsSync('.env.test') ? '.env.test' : null
)
dotenv.config(envFile ? { path: envFile } : {})

const { createKsefFacade } = require('../core/ksefFacade')
const { listenWithFallback } = require('../core/listen')
const { createInvoiceWorkflow, INVOICE_STATUS } = require('../core/invoiceWorkflow')
const { createStore } = require('../core/draftStore')
const { EXPORT_FORMATS } = require('../core/exportService')
const { EXPORT_FORMATS: KPIR_EXPORT_FORMATS } = require('../core/kpirExport')
const { createSqliteDataLayer } = require('../core/sqliteDataLayer')

const app = express()
app.use(helmet({ 
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "http://127.0.0.1:*", "http://localhost:*", "ws://127.0.0.1:*", "ws://localhost:*"],
      imgSrc: ["'self'", "data:", "blob:", "http:", "https:"],
      fontSrc: ["'self'", "data:", "http:", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'self'", "blob:", "data:"],
    },
  },
  crossOriginEmbedderPolicy: false
}))

// Override CSP for static files to allow inline scripts
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/') {
    res.setHeader('Content-Security-Policy', 
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*; " +
      "img-src 'self' data: blob: http: https:; " +
      "font-src 'self' data: http: https:; " +
      "object-src 'none'; " +
      "media-src 'self'; " +
      "frame-src 'self' blob: data:"
    );
  }
  next();
});

app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.get('/favicon.ico', (_req, res) => {
  res.status(204).end()
})

const projectsFilePath = process.env.EXEF_PROJECTS_FILE_PATH || path.join(__dirname, '../../data/projects.csv')
const labelsFilePath = process.env.EXEF_LABELS_FILE_PATH || path.join(__dirname, '../../data/labels.csv')
const settingsFilePath = process.env.EXEF_SETTINGS_FILE_PATH || path.join(__dirname, '../../data/settings.json')

const storageBackend = process.env.EXEF_STORAGE_BACKEND || 'files'
const dbPath = process.env.EXEF_DB_PATH || path.join(__dirname, '../../data/exef.sqlite')
function canUseSqliteBackend() {
  try {
    require.resolve('sql.js')
    return true
  } catch (_e) {
    return false
  }
}

const dataLayer = storageBackend === 'sqlite' && canUseSqliteBackend() ? createSqliteDataLayer({ dbPath }) : null

function getDefaultSettings() {
  return {
    version: 1,
    ui: {
      invoicesTable: {
        projectSelection: 'select',
        expenseTypeSelection: 'select',
      },
    },
    exports: {
      email: {
        to: null,
        from: null,
        smtp: {
          host: null,
          port: null,
          secure: false,
          starttls: false,
          user: null,
          password: null,
        },
      },
    },
    ocr: {
      provider: 'tesseract',
      api: {
        googleVisionApiUrl: null,
        googleVisionKey: null,
        googleVisionTimeoutMs: null,
        azureEndpoint: null,
        azureKey: null,
        externalPreset: null,
        externalUrl: null,
        timeoutMs: null,
        mockText: null,
      },
    },
    channels: {
      localFolders: { paths: [] },
      email: { accounts: [], activeAccountId: null },
      ksef: { accounts: [], activeAccountId: null },
      remoteStorage: { connections: [], state: {} },
      devices: { printers: [], scanners: [] },
      other: { sources: [] },
    },
  }
}

function buildSettingsFromEnv() {
  const settings = getDefaultSettings()
  const connections = []
  const emailAccounts = []
  const ksefAccounts = []

  // Dropbox from .env
  if (process.env.EXEF_DROPBOX_ENABLED === 'true' || process.env.EXEF_DROPBOX_ACCESS_TOKEN || process.env.EXEF_DROPBOX_REFRESH_TOKEN) {
    connections.push({
      id: 'dropbox-env',
      type: 'dropbox',
      name: 'Dropbox (env)',
      enabled: process.env.EXEF_DROPBOX_ENABLED !== 'false',
      apiUrl: process.env.EXEF_DROPBOX_API_URL || null,
      accessToken: process.env.EXEF_DROPBOX_ACCESS_TOKEN || null,
      refreshToken: process.env.EXEF_DROPBOX_REFRESH_TOKEN || null,
      clientId: process.env.EXEF_DROPBOX_CLIENT_ID || null,
      clientSecret: process.env.EXEF_DROPBOX_CLIENT_SECRET || null,
      folderPath: process.env.EXEF_DROPBOX_FOLDER_PATH || '/',
    })
  }

  // Google Drive from .env
  if (process.env.EXEF_GDRIVE_ENABLED === 'true' || process.env.EXEF_GDRIVE_ACCESS_TOKEN || process.env.EXEF_GDRIVE_REFRESH_TOKEN) {
    connections.push({
      id: 'gdrive-env',
      type: 'gdrive',
      name: 'Google Drive (env)',
      enabled: process.env.EXEF_GDRIVE_ENABLED !== 'false',
      apiUrl: process.env.EXEF_GDRIVE_API_URL || null,
      accessToken: process.env.EXEF_GDRIVE_ACCESS_TOKEN || null,
      refreshToken: process.env.EXEF_GDRIVE_REFRESH_TOKEN || null,
      clientId: process.env.EXEF_GDRIVE_CLIENT_ID || null,
      clientSecret: process.env.EXEF_GDRIVE_CLIENT_SECRET || null,
      folderId: process.env.EXEF_GDRIVE_FOLDER_ID || 'root',
    })
  }

  // OneDrive from .env
  if (process.env.EXEF_ONEDRIVE_ENABLED === 'true' || process.env.EXEF_ONEDRIVE_ACCESS_TOKEN || process.env.EXEF_ONEDRIVE_REFRESH_TOKEN) {
    connections.push({
      id: 'onedrive-env',
      type: 'onedrive',
      name: 'OneDrive (env)',
      enabled: process.env.EXEF_ONEDRIVE_ENABLED !== 'false',
      apiUrl: process.env.EXEF_ONEDRIVE_API_URL || null,
      accessToken: process.env.EXEF_ONEDRIVE_ACCESS_TOKEN || null,
      refreshToken: process.env.EXEF_ONEDRIVE_REFRESH_TOKEN || null,
      clientId: process.env.EXEF_ONEDRIVE_CLIENT_ID || null,
      clientSecret: process.env.EXEF_ONEDRIVE_CLIENT_SECRET || null,
      folderId: process.env.EXEF_ONEDRIVE_FOLDER_ID || 'root',
    })
  }

  // Nextcloud from .env
  if (process.env.EXEF_NEXTCLOUD_ENABLED === 'true' || process.env.EXEF_NEXTCLOUD_WEBDAV_URL) {
    connections.push({
      id: 'nextcloud-env',
      type: 'nextcloud',
      name: 'Nextcloud (env)',
      enabled: process.env.EXEF_NEXTCLOUD_ENABLED !== 'false',
      webdavUrl: process.env.EXEF_NEXTCLOUD_WEBDAV_URL || null,
      username: process.env.EXEF_NEXTCLOUD_USERNAME || null,
      password: process.env.EXEF_NEXTCLOUD_PASSWORD || null,
      folderPath: process.env.EXEF_NEXTCLOUD_FOLDER_PATH || '/',
    })
  }

  // IMAP email from .env
  if (process.env.EXEF_IMAP_ENABLED === 'true' || process.env.EXEF_IMAP_HOST) {
    emailAccounts.push({
      id: 'imap-env',
      type: 'imap',
      name: 'IMAP (env)',
      enabled: process.env.EXEF_IMAP_ENABLED !== 'false',
      imap: {
        host: process.env.EXEF_IMAP_HOST || null,
        port: process.env.EXEF_IMAP_PORT ? parseInt(process.env.EXEF_IMAP_PORT, 10) : 993,
        user: process.env.EXEF_IMAP_USER || null,
        password: process.env.EXEF_IMAP_PASSWORD || null,
        tls: process.env.EXEF_IMAP_TLS !== 'false',
      },
    })
  }

  // Gmail OAuth from .env
  if (process.env.EXEF_GMAIL_ENABLED === 'true' || process.env.EXEF_GMAIL_ACCESS_TOKEN || process.env.EXEF_GMAIL_REFRESH_TOKEN) {
    emailAccounts.push({
      id: 'gmail-env',
      type: 'gmail-oauth',
      name: 'Gmail (env)',
      enabled: process.env.EXEF_GMAIL_ENABLED !== 'false',
      oauth: {
        apiUrl: process.env.EXEF_GMAIL_API_URL || null,
        accessToken: process.env.EXEF_GMAIL_ACCESS_TOKEN || null,
        refreshToken: process.env.EXEF_GMAIL_REFRESH_TOKEN || null,
        clientId: process.env.EXEF_GMAIL_CLIENT_ID || null,
        clientSecret: process.env.EXEF_GMAIL_CLIENT_SECRET || null,
      },
    })
  }

  // Outlook OAuth from .env
  if (process.env.EXEF_OUTLOOK_ENABLED === 'true' || process.env.EXEF_OUTLOOK_ACCESS_TOKEN || process.env.EXEF_OUTLOOK_REFRESH_TOKEN) {
    emailAccounts.push({
      id: 'outlook-env',
      type: 'outlook-oauth',
      name: 'Outlook (env)',
      enabled: process.env.EXEF_OUTLOOK_ENABLED !== 'false',
      oauth: {
        apiUrl: process.env.EXEF_OUTLOOK_API_URL || null,
        accessToken: process.env.EXEF_OUTLOOK_ACCESS_TOKEN || null,
        refreshToken: process.env.EXEF_OUTLOOK_REFRESH_TOKEN || null,
        clientId: process.env.EXEF_OUTLOOK_CLIENT_ID || null,
        clientSecret: process.env.EXEF_OUTLOOK_CLIENT_SECRET || null,
      },
    })
  }

  // KSeF from .env
  if (process.env.EXEF_KSEF_ENABLED === 'true' || process.env.EXEF_KSEF_TOKEN) {
    ksefAccounts.push({
      id: 'ksef-env',
      name: 'KSeF (env)',
      enabled: process.env.EXEF_KSEF_ENABLED !== 'false',
      nip: process.env.EXEF_KSEF_NIP || null,
      accessToken: process.env.EXEF_KSEF_TOKEN || null,
      tokenType: process.env.EXEF_KSEF_TOKEN_TYPE || 'authorisation',
    })
  }

  // Scanners from .env
  const scanners = []
  for (let i = 1; i <= 10; i++) {
    const prefix = `EXEF_SCANNER_${i}_`
    if (process.env[`${prefix}ENABLED`] === 'true' || process.env[`${prefix}API_URL`]) {
      scanners.push({
        id: `scanner-${i}-env`,
        name: process.env[`${prefix}NAME`] || `Scanner ${i} (env)`,
        enabled: process.env[`${prefix}ENABLED`] !== 'false',
        apiUrl: process.env[`${prefix}API_URL`] || null,
        protocol: process.env[`${prefix}PROTOCOL`] || 'escl',
      })
    }
  }

  // Printers from .env
  const printers = []
  for (let i = 1; i <= 10; i++) {
    const prefix = `EXEF_PRINTER_${i}_`
    if (process.env[`${prefix}ENABLED`] === 'true' || process.env[`${prefix}API_URL`]) {
      printers.push({
        id: `printer-${i}-env`,
        name: process.env[`${prefix}NAME`] || `Printer ${i} (env)`,
        enabled: process.env[`${prefix}ENABLED`] !== 'false',
        apiUrl: process.env[`${prefix}API_URL`] || null,
        protocol: process.env[`${prefix}PROTOCOL`] || 'ipp',
      })
    }
  }

  // Local folders from .env
  const envWatchPaths = process.env.EXEF_WATCH_PATHS 
    ? process.env.EXEF_WATCH_PATHS.split(',').map((p) => p.trim()).filter(Boolean) 
    : []

  if (connections.length > 0) {
    settings.channels.remoteStorage.connections = connections
  }
  if (emailAccounts.length > 0) {
    settings.channels.email.accounts = emailAccounts
    settings.channels.email.activeAccountId = emailAccounts[0]?.id || null
  }
  if (ksefAccounts.length > 0) {
    settings.channels.ksef.accounts = ksefAccounts
    settings.channels.ksef.activeAccountId = ksefAccounts[0]?.id || null
  }
  if (envWatchPaths.length > 0) {
    settings.channels.localFolders.paths = envWatchPaths
  }

  if (
    process.env.EXEF_OCR_PROVIDER ||
    process.env.EXEF_OCR_EXTERNAL_URL ||
    process.env.EXEF_OCR_EXTERNAL_PRESET ||
    process.env.EXEF_OCR_GOOGLE_VISION_API_URL ||
    process.env.EXEF_OCR_GOOGLE_VISION_KEY ||
    process.env.EXEF_OCR_GOOGLE_VISION_TIMEOUT_MS ||
    process.env.EXEF_OCR_AZURE_ENDPOINT ||
    process.env.EXEF_OCR_AZURE_KEY
  ) {
    settings.ocr = settings.ocr || {}
    settings.ocr.provider = process.env.EXEF_OCR_PROVIDER || settings.ocr.provider
    settings.ocr.api = {
      ...(settings.ocr.api || {}),
      googleVisionApiUrl: process.env.EXEF_OCR_GOOGLE_VISION_API_URL || (settings.ocr.api || {}).googleVisionApiUrl,
      googleVisionKey: process.env.EXEF_OCR_GOOGLE_VISION_KEY || (settings.ocr.api || {}).googleVisionKey,
      googleVisionTimeoutMs: process.env.EXEF_OCR_GOOGLE_VISION_TIMEOUT_MS ? parseInt(process.env.EXEF_OCR_GOOGLE_VISION_TIMEOUT_MS, 10) : (settings.ocr.api || {}).googleVisionTimeoutMs,
      azureEndpoint: process.env.EXEF_OCR_AZURE_ENDPOINT || (settings.ocr.api || {}).azureEndpoint,
      azureKey: process.env.EXEF_OCR_AZURE_KEY || (settings.ocr.api || {}).azureKey,
      externalPreset: process.env.EXEF_OCR_EXTERNAL_PRESET || (settings.ocr.api || {}).externalPreset,
      externalUrl: process.env.EXEF_OCR_EXTERNAL_URL || (settings.ocr.api || {}).externalUrl,
      timeoutMs: process.env.EXEF_OCR_TIMEOUT_MS ? parseInt(process.env.EXEF_OCR_TIMEOUT_MS, 10) : (settings.ocr.api || {}).timeoutMs,
      mockText: process.env.EXEF_OCR_MOCK_TEXT || (settings.ocr.api || {}).mockText,
    }
  }

  if (scanners.length > 0) {
    settings.channels.devices = settings.channels.devices || {}
    settings.channels.devices.scanners = scanners
  }
  if (printers.length > 0) {
    settings.channels.devices = settings.channels.devices || {}
    settings.channels.devices.printers = printers
  }

  return settings
}

function isSettingsEmpty(settings) {
  if (!settings) return true
  const channels = settings.channels || {}
  const hasConnections = Array.isArray(channels.remoteStorage?.connections) && channels.remoteStorage.connections.length > 0
  const hasEmails = Array.isArray(channels.email?.accounts) && channels.email.accounts.length > 0
  const hasKsef = Array.isArray(channels.ksef?.accounts) && channels.ksef.accounts.length > 0
  const hasLocalFolders = Array.isArray(channels.localFolders?.paths) && channels.localFolders.paths.length > 0
  const provider = String(settings?.ocr?.provider || '').trim().toLowerCase()
  const api = settings?.ocr?.api && typeof settings.ocr.api === 'object' ? settings.ocr.api : null
  const hasOcr = !!(
    (provider && provider !== 'tesseract') ||
    (api && (api.externalUrl || api.mockText || (api.externalPreset && String(api.externalPreset) !== 'exef_pro')))
  )
  return !hasConnections && !hasEmails && !hasKsef && !hasLocalFolders && !hasOcr
}

function mergeEnvSettings(existingSettings, envSettings) {
  const result = { ...existingSettings }
  const shouldPreferEnv = isSettingsEmpty(existingSettings)
  
  // Merge remoteStorage connections - add env connections if not already present
  const existingConnIds = new Set((result.channels?.remoteStorage?.connections || []).map((c) => c.id))
  const envConnections = (envSettings.channels?.remoteStorage?.connections || []).filter((c) => !existingConnIds.has(c.id))
  if (envConnections.length > 0) {
    result.channels = result.channels || {}
    result.channels.remoteStorage = result.channels.remoteStorage || {}
    result.channels.remoteStorage.connections = [...(result.channels.remoteStorage.connections || []), ...envConnections]
  }

  // Merge email accounts
  const existingEmailIds = new Set((result.channels?.email?.accounts || []).map((a) => a.id))
  const envEmails = (envSettings.channels?.email?.accounts || []).filter((a) => !existingEmailIds.has(a.id))
  if (envEmails.length > 0) {
    result.channels = result.channels || {}
    result.channels.email = result.channels.email || {}
    result.channels.email.accounts = [...(result.channels.email.accounts || []), ...envEmails]
    if (!result.channels.email.activeAccountId && envEmails[0]?.id) {
      result.channels.email.activeAccountId = envEmails[0].id
    }
  }

  // Merge ksef accounts
  const existingKsefIds = new Set((result.channels?.ksef?.accounts || []).map((a) => a.id))
  const envKsef = (envSettings.channels?.ksef?.accounts || []).filter((a) => !existingKsefIds.has(a.id))
  if (envKsef.length > 0) {
    result.channels = result.channels || {}
    result.channels.ksef = result.channels.ksef || {}
    result.channels.ksef.accounts = [...(result.channels.ksef.accounts || []), ...envKsef]
    if (!result.channels.ksef.activeAccountId && envKsef[0]?.id) {
      result.channels.ksef.activeAccountId = envKsef[0].id
    }
  }

  // Merge local folders
  const existingPaths = new Set(result.channels?.localFolders?.paths || [])
  const envPaths = (envSettings.channels?.localFolders?.paths || []).filter((p) => !existingPaths.has(p))
  if (envPaths.length > 0) {
    result.channels = result.channels || {}
    result.channels.localFolders = result.channels.localFolders || {}
    result.channels.localFolders.paths = [...(result.channels.localFolders.paths || []), ...envPaths]
  }

  // Merge devices (scanners and printers)
  const existingScannerIds = new Set((result.channels?.devices?.scanners || []).map((s) => s.id))
  const envScanners = (envSettings.channels?.devices?.scanners || []).filter((s) => !existingScannerIds.has(s.id))
  if (envScanners.length > 0) {
    result.channels = result.channels || {}
    result.channels.devices = result.channels.devices || {}
    result.channels.devices.scanners = [...(result.channels.devices.scanners || []), ...envScanners]
  }

  const existingPrinterIds = new Set((result.channels?.devices?.printers || []).map((p) => p.id))
  const envPrinters = (envSettings.channels?.devices?.printers || []).filter((p) => !existingPrinterIds.has(p.id))
  if (envPrinters.length > 0) {
    result.channels = result.channels || {}
    result.channels.devices = result.channels.devices || {}
    result.channels.devices.printers = [...(result.channels.devices.printers || []), ...envPrinters]
  }

  if (envSettings?.ocr && typeof envSettings.ocr === 'object') {
    result.ocr = result.ocr && typeof result.ocr === 'object' ? { ...result.ocr } : {}
    const existingProvider = String(result.ocr.provider || '').trim().toLowerCase()
    const envProvider = envSettings.ocr.provider ? String(envSettings.ocr.provider).trim() : null
    if (envProvider && (!existingProvider || existingProvider === 'tesseract')) {
      result.ocr.provider = envProvider
    }

    const existingApi = result.ocr.api && typeof result.ocr.api === 'object' ? result.ocr.api : {}
    const envApi = envSettings.ocr.api && typeof envSettings.ocr.api === 'object' ? envSettings.ocr.api : {}
    const mergedApi = { ...existingApi }
    for (const [key, value] of Object.entries(envApi)) {
      if (value === undefined || value === null || value === '') {
        continue
      }
      if (mergedApi[key] === undefined || mergedApi[key] === null || mergedApi[key] === '') {
        mergedApi[key] = value
      }
    }
    result.ocr.api = mergedApi
  }

  return result
}

function readJsonFile(filePath, fallbackValue) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallbackValue
    }
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : fallbackValue
  } catch (_e) {
    return fallbackValue
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8')
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return []
  }
  return Array.from(new Set(value.map((v) => String(v)).map((v) => v.trim()).filter(Boolean)))
}

function csvEscape(value) {
  const raw = value === null || value === undefined ? '' : String(value)
  const safe = raw.replace(/"/g, '""')
  return `"${safe}"`
}

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        const next = line[i + 1]
        if (next === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur.trim())
  return out
}

function normalizeProjectsImportItems(items) {
  const list = Array.isArray(items) ? items : []
  return list
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({
      id: p.id != null ? String(p.id).trim() : '',
      nazwa: p.nazwa != null ? String(p.nazwa).trim() : '',
      klient: p.klient != null ? String(p.klient) : '',
      nip: p.nip != null ? String(p.nip) : '',
      budzet: p.budzet != null && p.budzet !== '' ? Number(p.budzet) : 0,
      status: p.status != null ? String(p.status) : 'aktywny',
      opis: p.opis != null ? String(p.opis) : '',
    }))
    .filter((p) => p.id && p.nazwa)
}

function normalizeLabelsImportItems(items) {
  const list = Array.isArray(items) ? items : []
  return list
    .filter((l) => l && typeof l === 'object')
    .map((l) => ({
      id: l.id != null ? String(l.id).trim() : '',
      nazwa: l.nazwa != null ? String(l.nazwa).trim() : '',
      kolor: l.kolor != null ? String(l.kolor) : '',
      opis: l.opis != null ? String(l.opis) : '',
    }))
    .filter((l) => l.id && l.nazwa)
}

function getActiveKsefAccount(currentSettings) {
  const accounts = Array.isArray(currentSettings?.channels?.ksef?.accounts)
    ? currentSettings.channels.ksef.accounts
    : []
  const activeId = currentSettings?.channels?.ksef?.activeAccountId || null
  if (!activeId) {
    return null
  }
  return accounts.find((a) => a && a.id === activeId) || null
}

function applyKsefFromSettings(currentSettings) {
  const active = getActiveKsefAccount(currentSettings)
  const token = active?.accessToken || null
  workflow.setKsefAccessToken(token)
}

function getActiveEmailAccount(currentSettings) {
  const accounts = Array.isArray(currentSettings?.channels?.email?.accounts)
    ? currentSettings.channels.email.accounts
    : []
  const activeId = currentSettings?.channels?.email?.activeAccountId || null
  if (activeId) {
    return accounts.find((a) => a && a.id === activeId) || null
  }
  return accounts.find((a) => a && a.enabled !== false) || null
}

function applyEmailFromSettings(currentSettings) {
  const account = getActiveEmailAccount(currentSettings)
  if (!account) {
    workflow.configureEmail({ provider: 'imap', imap: null, oauth: null })
    return
  }

  const provider = String(account.provider || account.type || '').trim().toLowerCase()
  if (provider.includes('gmail') || provider.includes('outlook') || provider.includes('oauth')) {
    workflow.configureEmail({
      provider: provider || 'gmail-oauth',
      imap: null,
      oauth: account.oauth || account.oauthConfig || account.config || account,
    })
    return
  }

  workflow.configureEmail({
    provider: provider || 'imap',
    imap: account.imap || account.imapConfig || account.config || account,
    oauth: null,
  })
}

function applyOcrFromSettings(currentSettings) {
  const cfg = currentSettings?.ocr && typeof currentSettings.ocr === 'object' ? currentSettings.ocr : null
  if (!cfg) {
    workflow.configureOcr({ provider: 'tesseract', api: null })
    return
  }
  workflow.configureOcr({
    provider: cfg.provider || 'tesseract',
    api: cfg.api || null,
  })
}

function applyDevicesFromSettings(currentSettings) {
  const devices = currentSettings?.channels?.devices || {}
  const scanners = Array.isArray(devices.scanners) ? devices.scanners : []
  const printers = Array.isArray(devices.printers) ? devices.printers : []
  workflow.configureDevices({ scanners, printers })
}

function loadSettings() {
  const defaults = getDefaultSettings()
  const fromFile = readJsonFile(settingsFilePath, defaults)
  const merged = {
    ...defaults,
    ...fromFile,
    ui: {
      ...defaults.ui,
      ...(fromFile.ui || {}),
      invoicesTable: {
        ...defaults.ui.invoicesTable,
        ...((fromFile.ui || {}).invoicesTable || {}),
      },
    },
    ocr: {
      ...defaults.ocr,
      ...(fromFile.ocr || {}),
      api: {
        ...defaults.ocr.api,
        ...((fromFile.ocr || {}).api || {}),
      },
    },
    channels: {
      ...defaults.channels,
      ...(fromFile.channels || {}),
      localFolders: {
        ...defaults.channels.localFolders,
        ...((fromFile.channels || {}).localFolders || {}),
      },
      email: {
        ...defaults.channels.email,
        ...((fromFile.channels || {}).email || {}),
      },
      ksef: {
        ...defaults.channels.ksef,
        ...((fromFile.channels || {}).ksef || {}),
      },
      remoteStorage: {
        ...defaults.channels.remoteStorage,
        ...((fromFile.channels || {}).remoteStorage || {}),
      },
    },
  }
  merged.channels.localFolders.paths = normalizeStringArray(merged.channels.localFolders.paths)
  return merged
}

let settings = loadSettings()

const UI_THEMES = ['white', 'dark', 'warm']

function parseCssColor(input) {
  const raw = String(input || '').trim().toLowerCase()
  if (!raw) {
    return null
  }

  const hexMatch = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hexMatch) {
    const hex = hexMatch[1]
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16)
      const g = parseInt(hex[1] + hex[1], 16)
      const b = parseInt(hex[2] + hex[2], 16)
      return { r, g, b, a: 1 }
    }
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    return { r, g, b, a: 1 }
  }

  const rgbMatch = raw.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i)
  if (rgbMatch) {
    const r = Math.max(0, Math.min(255, Number(rgbMatch[1])))
    const g = Math.max(0, Math.min(255, Number(rgbMatch[2])))
    const b = Math.max(0, Math.min(255, Number(rgbMatch[3])))
    const a = rgbMatch[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(rgbMatch[4])))
    return { r, g, b, a }
  }

  return null
}

function srgbToLinear(channel) {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function relativeLuminance(rgb) {
  const r = srgbToLinear(rgb.r)
  const g = srgbToLinear(rgb.g)
  const b = srgbToLinear(rgb.b)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(fgRgb, bgRgb) {
  const L1 = relativeLuminance(fgRgb)
  const L2 = relativeLuminance(bgRgb)
  const light = Math.max(L1, L2)
  const dark = Math.min(L1, L2)
  return (light + 0.05) / (dark + 0.05)
}

function normalizePalette(input) {
  const palette = input && typeof input === 'object' ? input : {}
  const get = (key) => palette[key]
  return {
    bg: get('bg'),
    surface: get('surface'),
    surface2: get('surface2') ?? get('surface-2'),
    border: get('border'),
    text: get('text'),
    muted: get('muted'),
    primary: get('primary'),
    primaryContrast: get('primaryContrast') ?? get('primary-contrast'),
    navActiveBg: get('navActiveBg') ?? get('nav-active-bg'),
    navActiveText: get('navActiveText') ?? get('nav-active-text'),
    codeBg: get('codeBg') ?? get('code-bg'),
    suggestionBg: get('suggestionBg') ?? get('suggestion-bg'),
    suggestionText: get('suggestionText') ?? get('suggestion-text'),
  }
}

function buildContrastChecks(palette) {
  const pairs = [
    { name: 'text on bg', fg: palette.text, bg: palette.bg },
    { name: 'text on surface', fg: palette.text, bg: palette.surface },
    { name: 'muted on surface', fg: palette.muted, bg: palette.surface },
    { name: 'text on surface2', fg: palette.text, bg: palette.surface2 },
    { name: 'primary-contrast on primary', fg: palette.primaryContrast, bg: palette.primary },
    { name: 'nav-active-text on nav-active-bg', fg: palette.navActiveText, bg: palette.navActiveBg },
    { name: 'suggestion-text on suggestion-bg', fg: palette.suggestionText, bg: palette.suggestionBg },
    { name: 'text on code-bg', fg: palette.text, bg: palette.codeBg },
  ]

  return pairs.map((pair) => {
    const fg = parseCssColor(pair.fg)
    const bg = parseCssColor(pair.bg)
    if (!fg || !bg) {
      return {
        name: pair.name,
        fg: pair.fg,
        bg: pair.bg,
        ratio: null,
        passesAA: false,
        passesAAA: false,
        error: 'invalid_color',
      }
    }
    const ratio = contrastRatio(fg, bg)
    const passesAA = ratio >= 4.5
    const passesAAA = ratio >= 7
    return {
      name: pair.name,
      fg: pair.fg,
      bg: pair.bg,
      ratio,
      passesAA,
      passesAAA,
    }
  })
}

async function getSettingsFromBackend() {
  const defaults = getDefaultSettings()
  if (dataLayer) {
    const loaded = await dataLayer.getSettings(defaults)
    if (loaded?.channels?.localFolders) {
      loaded.channels.localFolders.paths = normalizeStringArray(loaded.channels.localFolders.paths)
    }
    loaded.ocr = {
      ...defaults.ocr,
      ...(loaded.ocr || {}),
      api: {
        ...defaults.ocr.api,
        ...((loaded.ocr || {}).api || {}),
      },
    }
    if (loaded?.channels) {
      loaded.channels.email = {
        ...defaults.channels.email,
        ...((loaded.channels || {}).email || {}),
      }
      loaded.channels.ksef = {
        ...defaults.channels.ksef,
        ...((loaded.channels || {}).ksef || {}),
      }
      loaded.channels.remoteStorage = {
        ...defaults.channels.remoteStorage,
        ...((loaded.channels || {}).remoteStorage || {}),
      }
    }
    return loaded
  }
  return loadSettings()
}

async function initSettingsFromEnv() {
  const envSettings = buildSettingsFromEnv()
  const hasEnvConfig = !isSettingsEmpty(envSettings)
  
  if (!hasEnvConfig) {
    return null
  }

  if (dataLayer) {
    const defaults = getDefaultSettings()
    const currentSettings = await dataLayer.getSettings(defaults)
    
    if (isSettingsEmpty(currentSettings)) {
      console.log('[env] SQLite settings empty, populating from .env...')
      const merged = mergeEnvSettings(currentSettings, envSettings)
      await dataLayer.setSettings(merged)
      console.log('[env] Settings populated from .env:', {
        connections: merged.channels?.remoteStorage?.connections?.length || 0,
        emailAccounts: merged.channels?.email?.accounts?.length || 0,
        ksefAccounts: merged.channels?.ksef?.accounts?.length || 0,
        localFolders: merged.channels?.localFolders?.paths?.length || 0,
      })
      return merged
    } else {
      console.log('[env] SQLite settings already configured, merging new .env entries...')
      const merged = mergeEnvSettings(currentSettings, envSettings)
      await dataLayer.setSettings(merged)
      return merged
    }
  } else {
    const currentSettings = loadSettings()
    if (isSettingsEmpty(currentSettings)) {
      console.log('[env] File settings empty, populating from .env...')
      const merged = mergeEnvSettings(currentSettings, envSettings)
      writeJsonFile(settingsFilePath, merged)
      return merged
    }
  }
  
  return null
}

async function setSettingsToBackend(nextSettings) {
  if (dataLayer) {
    await dataLayer.setSettings(nextSettings)
    return nextSettings
  }
  writeJsonFile(settingsFilePath, nextSettings)
  return nextSettings
}

app.use('/test', express.static(path.join(__dirname, '../../test/gui')))

app.use('/vendor/pdfjs', express.static(path.join(__dirname, '../../node_modules/pdfjs-dist/build'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, _filePath) => {
    res.setHeader('Cache-Control', 'no-store')
  },
}))


// Serve desktop renderer with CSP override
app.use('/', (req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    const filePath = path.join(__dirname, '../desktop/renderer', req.path === '/' ? 'index.html' : req.path);
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      // Remove CSP meta tag and let server handle it
      content = content.replace(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');

      const rendererJsPath = path.join(__dirname, '../desktop/renderer', 'renderer.js');
      const rendererJsVersion = fs.existsSync(rendererJsPath) ? String(Math.floor(fs.statSync(rendererJsPath).mtimeMs)) : String(Date.now());
      content = content.replace(
        /(<script[^>]+src=["']\.\/renderer\.js)(["'])/i,
        `$1?v=${rendererJsVersion}$2`
      );

      res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*; " +
        "img-src 'self' data: http: https:; " +
        "font-src 'self' data: http: https:; " +
        "object-src 'none'; " +
        "media-src 'self'; " +
        "frame-src 'self' blob: data:"
      );

      res.setHeader('Cache-Control', 'no-store');
      res.send(content);
      return;
    }
  }
  next();
}, express.static(path.join(__dirname, '../desktop/renderer'), {
  etag: false,
  lastModified: false,
  setHeaders: (res, _filePath) => {
    res.setHeader('Cache-Control', 'no-store')
  },
}))

function rewriteXslImportsToProxy(xslText) {
  if (!xslText) return xslText
  return String(xslText).replace(
    /href=(['"])(https?:\/\/[^'\"]+?\.xsl)\1/gi,
    (_m, quote, href) => `href=${quote}/ksef/xsl/proxy?url=${encodeURIComponent(href)}${quote}`
  )
}

function isAllowedRemoteXslUrl(rawUrl) {
  try {
    const u = new URL(rawUrl)
    const allowedHosts = new Set([
      'crd.gov.pl',
      'jpk.mf.gov.pl',
      'ksef.mf.gov.pl',
      'ksef-test.mf.gov.pl',
      'ksef-demo.mf.gov.pl',
    ])
    return (u.protocol === 'http:' || u.protocol === 'https:') && allowedHosts.has(u.hostname)
  } catch (_e) {
    return false
  }
}

app.get('/ksef/xsl/proxy', async (req, res) => {
  const target = req.query.url
  if (!target || typeof target !== 'string' || !isAllowedRemoteXslUrl(target)) {
    return res.status(400).json({ error: 'invalid_xsl_url' })
  }

  try {
    const response = await fetch(target)
    if (!response.ok) {
      return res.status(502).json({ error: `xsl_fetch_failed_${response.status}` })
    }

    const text = await response.text()
    const rewritten = rewriteXslImportsToProxy(text)
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.send(rewritten)
  } catch (err) {
    res.status(502).json({ error: err?.message ?? 'xsl_fetch_failed' })
  }
})

app.get('/ksef/xsl/:name', (req, res) => {
  const name = String(req.params.name || '')
  const allowed = new Set(['styl-fa2.xsl', 'styl-fa3.xsl', 'upo.xsl'])
  if (!allowed.has(name)) {
    return res.status(404).json({ error: 'xsl_not_found' })
  }

  const filePath = path.join(__dirname, '../../../ksef', name)
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'xsl_not_found' })
  }

  const raw = fs.readFileSync(filePath, 'utf8')
  const rewritten = rewriteXslImportsToProxy(raw)
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.send(rewritten)
})

const ksef = createKsefFacade({})

const store = dataLayer
  ? createStore({ dataLayer, backend: 'sqlite', dbPath })
  : createStore({ filePath: process.env.EXEF_INVOICE_STORE_PATH || './data/invoices.json' })

const envWatchPaths = process.env.EXEF_WATCH_PATHS ? process.env.EXEF_WATCH_PATHS.split(',') : []
const initialWatchPaths = settings?.channels?.localFolders?.paths?.length
  ? settings.channels.localFolders.paths
  : envWatchPaths

const initialStorageConnections = Array.isArray(settings?.channels?.remoteStorage?.connections)
  ? settings.channels.remoteStorage.connections
  : []
 
const workflow = createInvoiceWorkflow({
  store,
  ksefFacade: ksef,
  watchPaths: initialWatchPaths,
  storageConnections: initialStorageConnections,
})

if (workflow?.storageSync && typeof workflow.storageSync.setState === 'function') {
  workflow.storageSync.setState(settings?.channels?.remoteStorage?.state || {})
}

applyKsefFromSettings(settings)
applyEmailFromSettings(settings)
applyOcrFromSettings(settings)
applyDevicesFromSettings(settings)

function applyDevicesFromSettings(currentSettings) {
  const devices = currentSettings?.channels?.devices || {}
  const scanners = Array.isArray(devices.scanners) ? devices.scanners : []
  const printers = Array.isArray(devices.printers) ? devices.printers : []
  workflow.configureDevices({ scanners, printers })
}

let pendingRemoteStorageState = null
let remoteStorageStateSaveTimer = null

let pendingRemoteStorageConnectionUpdate = null
let remoteStorageConnectionSaveTimer = null

if (workflow?.storageSync) {
  workflow.storageSync.on('state:changed', (state) => {
    pendingRemoteStorageState = state

    if (remoteStorageStateSaveTimer) {
      return
    }

    remoteStorageStateSaveTimer = setTimeout(async () => {
      remoteStorageStateSaveTimer = null

      const stateToSave = pendingRemoteStorageState
      pendingRemoteStorageState = null
      if (!stateToSave) {
        return
      }

      try {
        const current = await getSettingsFromBackend()
        const nextSettings = {
          ...current,
          channels: {
            ...(current.channels || {}),
            remoteStorage: {
              ...(((current.channels || {}).remoteStorage) || {}),
              state: stateToSave,
            },
          },
        }
        await setSettingsToBackend(nextSettings)
        settings = nextSettings
      } catch (_e) {
      }
    }, 1000)
  })

  workflow.storageSync.on('connection:updated', (payload) => {
    const updatedConnection = payload?.connection
    if (!updatedConnection || !updatedConnection.id) {
      return
    }

    pendingRemoteStorageConnectionUpdate = updatedConnection

    if (remoteStorageConnectionSaveTimer) {
      return
    }

    remoteStorageConnectionSaveTimer = setTimeout(async () => {
      remoteStorageConnectionSaveTimer = null

      const connectionToSave = pendingRemoteStorageConnectionUpdate
      pendingRemoteStorageConnectionUpdate = null
      if (!connectionToSave) {
        return
      }

      try {
        const current = await getSettingsFromBackend()
        const existingConnections = Array.isArray(current?.channels?.remoteStorage?.connections)
          ? current.channels.remoteStorage.connections
          : []

        const nextConnections = existingConnections.map((c) =>
          c && c.id === connectionToSave.id
            ? { ...c, ...connectionToSave }
            : c
        )

        const nextSettings = {
          ...current,
          channels: {
            ...(current.channels || {}),
            remoteStorage: {
              ...(((current.channels || {}).remoteStorage) || {}),
              connections: nextConnections,
            },
          },
        }

        await setSettingsToBackend(nextSettings)
        settings = nextSettings
      } catch (_e) {
      }
    }, 1000)
  })
}

if (dataLayer) {
  (async () => {
    try {
      // First, try to populate settings from .env if SQLite is empty
      const envPopulated = await initSettingsFromEnv()
      
      // Then load the final settings (which may include .env values)
      const loaded = envPopulated || await getSettingsFromBackend()
      settings = loaded
      
      workflow.configureStorage({
        watchPaths: settings.channels.localFolders.paths,
        connections: settings?.channels?.remoteStorage?.connections || [],
      })

      if (workflow?.storageSync && typeof workflow.storageSync.setState === 'function') {
        workflow.storageSync.setState(settings?.channels?.remoteStorage?.state || {})
      }

      applyKsefFromSettings(settings)
      applyEmailFromSettings(settings)
      applyOcrFromSettings(settings)
      applyDevicesFromSettings(settings)
    } catch (_e) {
      console.error('[env] Failed to initialize settings:', _e.message)
    }
  })()
}

const expenseTypesFilePath = process.env.EXEF_EXPENSE_TYPES_FILE_PATH || path.join(__dirname, '../../data/expense_types.csv')

const recentWorkflowEvents = []
function pushWorkflowEvent(type, payload) {
  recentWorkflowEvents.push({ ts: new Date().toISOString(), type, payload })
  while (recentWorkflowEvents.length > 200) {
    recentWorkflowEvents.shift()
  }
}

workflow.on('email:error', (err) => pushWorkflowEvent('email:error', { message: err?.message ?? String(err) }))
workflow.on('storage:error', (err) => pushWorkflowEvent('storage:error', { message: err?.message ?? String(err) }))
workflow.on('ocr:error', (data) => pushWorkflowEvent('ocr:error', data))
workflow.on('ksef:error', (err) => pushWorkflowEvent('ksef:error', { message: err?.message ?? String(err) }))
workflow.on('invoice:added', (inv) => pushWorkflowEvent('invoice:added', { id: inv?.id, source: inv?.source, fileName: inv?.fileName }))
workflow.on('invoice:updated', (inv) => pushWorkflowEvent('invoice:updated', { id: inv?.id, status: inv?.status }))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'exef-local-service' })
})

app.get('/debug/workflow/events', (_req, res) => {
  res.json({ events: recentWorkflowEvents })
})

app.get('/debug/storage/state', (_req, res) => {
  try {
    const state = workflow?.storageSync && typeof workflow.storageSync.getState === 'function'
      ? workflow.storageSync.getState()
      : null
    res.json({ state })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

function isInvoiceFileName(name) {
  const n = String(name || '').toLowerCase()
  return n.endsWith('.pdf') || n.endsWith('.jpg') || n.endsWith('.jpeg') || n.endsWith('.png') || n.endsWith('.xml')
}

async function fetchJsonWithTimeout(targetUrl, options = {}, timeoutMs = 1200) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(targetUrl, { ...options, signal: controller.signal })
    const json = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, json }
  } finally {
    clearTimeout(timer)
  }
}

async function fetchBufferWithTimeout(targetUrl, options = {}, timeoutMs = 1500) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(targetUrl, { ...options, signal: controller.signal })
    const buf = Buffer.from(await res.arrayBuffer())
    return { ok: res.ok, status: res.status, buf }
  } finally {
    clearTimeout(timer)
  }
}

async function listStorageCandidates(conn) {
  const type = String(conn?.type || '').trim().toLowerCase()
  const apiUrl = conn?.apiUrl || conn?.webdavUrl || null
  const accessToken = conn?.accessToken || conn?.oauth?.accessToken || conn?.oauthConfig?.accessToken || null
  const username = conn?.username || conn?.user || null
  const password = conn?.password || conn?.appPassword || null

  if (type === 'dropbox') {
    const base = String(apiUrl || 'https://api.dropboxapi.com').replace(/\/$/, '')
    const out = await fetchJsonWithTimeout(
      `${base}/2/files/list_folder`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken || 'test'}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: String(conn?.folderPath || conn?.path || ''), recursive: true, include_deleted: false }),
      },
      1200
    )
    if (!out.ok) {
      return { ok: false, error: `dropbox_list_${out.status}` }
    }
    const entries = Array.isArray(out.json?.entries) ? out.json.entries : []
    const files = entries
      .filter((e) => e && e['.tag'] === 'file' && isInvoiceFileName(e.name))
      .map((e) => ({
        name: e.name,
        sourceKey: `dropbox:${conn?.id || 'dropbox'}:${e.id || e.path_display || e.name}:${e.server_modified || ''}`,
      }))
    return { ok: true, files }
  }

  if (type === 'gdrive') {
    const base = String(apiUrl || 'https://www.googleapis.com').replace(/\/$/, '')
    const folderId = String(conn?.folderId || (Array.isArray(conn?.folderIds) ? conn.folderIds[0] : '') || 'root')
    const q = `'${folderId.replace(/'/g, "\\'")}' in parents and trashed=false`
    const out = await fetchJsonWithTimeout(
      `${base}/drive/v3/files?q=${encodeURIComponent(q)}&pageSize=1000&fields=${encodeURIComponent('files(id,name,mimeType,size,modifiedTime)')}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken || 'test'}`,
        },
      },
      1200
    )
    if (!out.ok) {
      return { ok: false, error: `gdrive_list_${out.status}` }
    }
    const files = (Array.isArray(out.json?.files) ? out.json.files : [])
      .filter((f) => f && isInvoiceFileName(f.name))
      .map((f) => ({
        name: f.name,
        sourceKey: `gdrive:${conn?.id || 'gdrive'}:${f.id || f.name}:${f.modifiedTime || ''}`,
      }))
    return { ok: true, files }
  }

  if (type === 'onedrive') {
    const base = String(apiUrl || 'https://graph.microsoft.com').replace(/\/$/, '')
    const out = await fetchJsonWithTimeout(
      `${base}/v1.0/me/drive/root/delta`,
      {
        headers: {
          Authorization: `Bearer ${accessToken || 'test'}`,
        },
      },
      1200
    )
    if (!out.ok) {
      return { ok: false, error: `onedrive_list_${out.status}` }
    }
    const items = Array.isArray(out.json?.value) ? out.json.value : []
    const files = items
      .filter((i) => i && !i.folder && isInvoiceFileName(i.name))
      .map((i) => ({
        name: i.name,
        sourceKey: `onedrive:${conn?.id || 'onedrive'}:${i.id || i.name}:${i.eTag || i.lastModifiedDateTime || ''}`,
      }))
    return { ok: true, files }
  }

  if (type === 'nextcloud') {
    let adminBase = null
    try {
      adminBase = apiUrl ? new URL(String(apiUrl)).origin : null
    } catch (_e) {
      adminBase = null
    }

    const outAdmin = await fetchJsonWithTimeout(
      `${String(adminBase || '').replace(/\/$/, '')}/admin/files`,
      {},
      1200
    )
    if (outAdmin.ok && Array.isArray(outAdmin.json?.files)) {
      const files = outAdmin.json.files
        .filter((f) => f && isInvoiceFileName(f.name))
        .map((f) => ({
          name: f.name,
          sourceKey: `nextcloud:${conn?.id || 'nextcloud'}:${f.href || f.name}:${f.etag || f.lastModified || ''}`,
        }))
      return { ok: true, files }
    }

    if (!apiUrl || !username || !password) {
      return { ok: false, error: 'nextcloud_not_configured' }
    }
    const auth = Buffer.from(`${String(username)}:${String(password)}`).toString('base64')
    const propfindBody =
      '<?xml version="1.0" encoding="utf-8" ?>' +
      '<d:propfind xmlns:d="DAV:">' +
      '<d:prop><d:getcontenttype/><d:getcontentlength/><d:getlastmodified/><d:getetag/></d:prop>' +
      '</d:propfind>'
    const base = String(apiUrl).replace(/\/$/, '')
    const res = await fetch(base, {
      method: 'PROPFIND',
      headers: {
        Authorization: `Basic ${auth}`,
        Depth: '1',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body: propfindBody,
    })
    if (!res.ok) {
      return { ok: false, error: `nextcloud_propfind_${res.status}` }
    }
    const xml = await res.text().catch(() => '')
    const responses = xml.split(/<[^>]*response[^>]*>/i).slice(1)
    const files = []
    for (const chunk of responses) {
      const hrefMatch = chunk.match(/<[^>]*href[^>]*>([^<]+)<\/[^>]*href>/i)
      if (!hrefMatch) continue
      const hrefRaw = hrefMatch[1]
      const href = hrefRaw.replace(/&amp;/g, '&').trim()
      const name = decodeURIComponent(href.split('/').filter(Boolean).slice(-1)[0] || '')
      if (!name || !isInvoiceFileName(name)) continue
      const etagMatch = chunk.match(/<[^>]*getetag[^>]*>([^<]+)<\/[^>]*getetag>/i)
      const lastModMatch = chunk.match(/<[^>]*getlastmodified[^>]*>([^<]+)<\/[^>]*getlastmodified>/i)
      const etag = etagMatch ? etagMatch[1].trim() : ''
      const lastModified = lastModMatch ? lastModMatch[1].trim() : ''
      files.push({
        name,
        sourceKey: `nextcloud:${conn?.id || 'nextcloud'}:${href}:${etag || lastModified}`,
      })
    }
    return { ok: true, files }
  }

  return { ok: true, files: [] }
}

async function listEmailCandidates(account) {
  const provider = String(account?.provider || account?.type || '').trim().toLowerCase()
  const oauth = account?.oauth || account?.oauthConfig || null
  const apiUrl = oauth?.apiUrl || null

  if (!apiUrl) {
    return { ok: false, error: 'email_api_url_missing', attachments: [] }
  }

  if (provider.includes('gmail')) {
    const listOut = await fetchJsonWithTimeout(
      `${String(apiUrl).replace(/\/$/, '')}/gmail/v1/users/me/messages?q=${encodeURIComponent('has:attachment')}&maxResults=50`,
      {},
      1200
    )
    if (!listOut.ok) {
      return { ok: false, error: `gmail_list_${listOut.status}`, attachments: [] }
    }
    const messages = Array.isArray(listOut.json?.messages) ? listOut.json.messages : []
    const attachments = []
    for (const msg of messages) {
      const messageId = msg?.id
      if (!messageId) continue
      const msgOut = await fetchJsonWithTimeout(
        `${String(apiUrl).replace(/\/$/, '')}/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`,
        {},
        1200
      )
      if (!msgOut.ok) {
        continue
      }
      const payload = msgOut.json?.payload || {}
      const headers = Array.isArray(payload.headers) ? payload.headers : []
      const header = (name) => headers.find((h) => String(h?.name || '').toLowerCase() === String(name).toLowerCase())?.value
      const parts = Array.isArray(payload.parts) ? payload.parts : []
      for (const part of parts) {
        if (!part?.filename || !part?.body?.attachmentId) continue
        if (!isInvoiceFileName(part.filename)) continue
        const filename = String(part.filename)
        attachments.push({
          provider: 'gmail-oauth',
          apiUrl,
          messageId,
          attachmentId: String(part.body.attachmentId),
          fileName: filename,
          fileType: part.mimeType || null,
          fileSize: part.body.size != null ? Number(part.body.size) : null,
          sourceKey: `email:${String(messageId)}:${filename}`,
          emailSubject: header('Subject') || null,
          emailFrom: header('From') || null,
          emailDate: header('Date') || null,
        })
      }
    }
    return { ok: true, attachments }
  }

  if (provider.includes('outlook')) {
    const listUrl =
      `${String(apiUrl).replace(/\/$/, '')}/v1.0/me/messages` +
      `?$filter=${encodeURIComponent('hasAttachments eq true')}` +
      `&$expand=${encodeURIComponent('attachments')}` +
      `&$top=50`
    const listOut = await fetchJsonWithTimeout(listUrl, {}, 1200)
    if (!listOut.ok) {
      return { ok: false, error: `outlook_list_${listOut.status}`, attachments: [] }
    }
    const messages = Array.isArray(listOut.json?.value) ? listOut.json.value : []
    const attachments = []
    for (const msg of messages) {
      const messageId = msg?.id
      if (!messageId) continue
      const atts = Array.isArray(msg?.attachments) ? msg.attachments : []
      for (const att of atts) {
        const filename = att?.name
        if (!filename || !isInvoiceFileName(filename)) continue
        attachments.push({
          provider: 'outlook-oauth',
          apiUrl,
          messageId,
          attachmentId: String(att.id || ''),
          fileName: String(filename),
          fileType: att.contentType || null,
          fileSize: att.size != null ? Number(att.size) : null,
          sourceKey: `email:${String(messageId)}:${String(filename)}`,
          emailSubject: msg.subject || null,
          emailFrom: msg.from?.emailAddress?.address || null,
          emailDate: msg.receivedDateTime || null,
        })
      }
    }
    return { ok: true, attachments }
  }

  return { ok: true, attachments: [] }
}

app.get('/sources/status', async (_req, res) => {
  try {
    settings = await getSettingsFromBackend()

    const result = {
      ksef: {
        accounts: Array.isArray(settings?.channels?.ksef?.accounts) ? settings.channels.ksef.accounts.map((a) => ({
          id: a?.id || null,
          name: a?.name || null,
          enabled: a?.enabled !== false,
          nip: a?.nip || null,
          hasToken: Boolean(a?.accessToken),
        })) : [],
        activeAccountId: settings?.channels?.ksef?.activeAccountId || null,
      },
      storage: {
        localFolders: Array.isArray(settings?.channels?.localFolders?.paths) ? settings.channels.localFolders.paths : [],
        localFoldersStatus: [],
        connections: [],
      },
      email: {
        accounts: Array.isArray(settings?.channels?.email?.accounts) ? settings.channels.email.accounts.map((a) => ({
          id: a?.id || null,
          name: a?.name || null,
          provider: a?.provider || a?.type || null,
          enabled: a?.enabled !== false,
          apiUrl: (a?.oauth || a?.oauthConfig)?.apiUrl || null,
          imapHost: (a?.imap || a?.imapConfig)?.host || null,
        })) : [],
        activeAccountId: settings?.channels?.email?.activeAccountId || null,
      },
      devices: {
        scanners: [],
        printers: [],
      },
    }

    const inbox = workflow?.inbox || null

    for (const p of (Array.isArray(result.storage.localFolders) ? result.storage.localFolders : [])) {
      const watchPath = String(p || '').trim()
      if (!watchPath) {
        continue
      }
      try {
        if (!fs.existsSync(watchPath)) {
          result.storage.localFoldersStatus.push({ path: watchPath, ok: false, error: 'path_not_found', total: 0, pending: inbox ? 0 : null })
          continue
        }
        const files = fs.readdirSync(watchPath)
        const candidates = []
        for (const file of files) {
          const ext = path.extname(file).toLowerCase()
          if (!isInvoiceFileName(file) || !ext) {
            continue
          }
          const fullPath = path.join(watchPath, file)
          let stat = null
          try {
            stat = fs.statSync(fullPath)
          } catch (_e) {
          }
          if (!stat || !stat.isFile()) {
            continue
          }
          const fileKey = `${fullPath}:${stat.mtimeMs}`
          candidates.push({ name: file, sourceKey: `local:${fileKey}` })
        }

        let pending = 0
        if (inbox && typeof inbox.getInvoiceBySourceKey === 'function') {
          for (const f of candidates) {
            const existing = await inbox.getInvoiceBySourceKey(f.sourceKey)
            if (!existing) {
              pending++
            }
          }
        }

        result.storage.localFoldersStatus.push({
          path: watchPath,
          ok: true,
          error: null,
          total: candidates.length,
          pending: inbox ? pending : null,
        })
      } catch (e) {
        result.storage.localFoldersStatus.push({ path: watchPath, ok: false, error: e?.message || 'unknown_error', total: 0, pending: inbox ? 0 : null })
      }
    }

    const connections = Array.isArray(settings?.channels?.remoteStorage?.connections)
      ? settings.channels.remoteStorage.connections
      : []
    for (const conn of connections) {
      if (!conn || conn.enabled === false) {
        continue
      }
      try {
        const list = await listStorageCandidates(conn)
        const files = Array.isArray(list.files) ? list.files : []
        let newCount = 0
        if (inbox && typeof inbox.getInvoiceBySourceKey === 'function') {
          for (const f of files) {
            if (!f?.sourceKey) continue
            const existing = await inbox.getInvoiceBySourceKey(f.sourceKey)
            if (!existing) {
              newCount++
            }
          }
        }
        result.storage.connections.push({
          id: conn.id || null,
          name: conn.name || null,
          type: conn.type || null,
          enabled: conn.enabled !== false,
          apiUrl: conn.apiUrl || conn.webdavUrl || null,
          total: files.length,
          pending: inbox ? newCount : null,
          ok: list.ok !== false,
          error: list.ok === false ? list.error : null,
        })
      } catch (connErr) {
        result.storage.connections.push({
          id: conn.id || null,
          name: conn.name || null,
          type: conn.type || null,
          enabled: conn.enabled !== false,
          apiUrl: conn.apiUrl || conn.webdavUrl || null,
          total: 0,
          pending: null,
          ok: false,
          error: connErr?.message || 'connection_failed',
        })
      }
    }

    const scanners = Array.isArray(settings?.channels?.devices?.scanners)
      ? settings.channels.devices.scanners
      : []
    for (const s of scanners) {
      if (!s || s.enabled === false) continue
      const status = await workflow.deviceSync.getScannerStatus(s.id).catch((e) => ({ status: 'offline', error: e?.message }))
      let docs = []
      if (status?.status === 'online') {
        docs = await workflow.deviceSync.listScannerDocuments(s.id).catch(() => [])
      }
      let pendingDocs = Array.isArray(docs) ? docs.length : 0
      if (inbox && typeof inbox.getInvoiceBySourceKey === 'function' && Array.isArray(docs)) {
        pendingDocs = 0
        for (const d of docs) {
          const docId = d?.id ? String(d.id) : null
          if (!docId) continue
          const sk = `scanner:${String(s.id)}:${docId}`
          const existing = await inbox.getInvoiceBySourceKey(sk)
          if (!existing) {
            pendingDocs++
          }
        }
      }
      result.devices.scanners.push({
        id: s.id || null,
        name: s.name || null,
        apiUrl: s.apiUrl || null,
        enabled: s.enabled !== false,
        status: status?.status || null,
        pending: pendingDocs,
        ok: status?.status === 'online',
        error: status?.status === 'online' ? null : (status?.error || null),
      })
    }

    const printers = Array.isArray(settings?.channels?.devices?.printers)
      ? settings.channels.devices.printers
      : []
    for (const p of printers) {
      if (!p || p.enabled === false) continue
      const status = await workflow.deviceSync.getPrinterStatus(p.id).catch((e) => ({ status: 'offline', error: e?.message }))
      result.devices.printers.push({
        id: p.id || null,
        name: p.name || null,
        apiUrl: p.apiUrl || null,
        enabled: p.enabled !== false,
        status: status?.status || null,
        ok: status?.status === 'online',
        error: status?.status === 'online' ? null : (status?.error || null),
      })
    }

    for (const acc of (Array.isArray(settings?.channels?.email?.accounts) ? settings.channels.email.accounts : [])) {
      if (!acc || acc.enabled === false) continue
      try {
        const listed = await listEmailCandidates(acc)
        const attachments = Array.isArray(listed.attachments) ? listed.attachments : []
        let newCount = 0
        if (inbox && typeof inbox.getInvoiceBySourceKey === 'function') {
          for (const att of attachments) {
            if (!att?.sourceKey) continue
            const existing = await inbox.getInvoiceBySourceKey(att.sourceKey)
            if (!existing) {
              newCount++
            }
          }
        }
        result.email.accounts = result.email.accounts.map((a) => {
          if (!a || a.id !== acc.id) return a
          return {
            ...a,
            total: attachments.length,
            pending: inbox ? newCount : null,
            ok: listed.ok !== false,
            error: listed.ok === false ? listed.error : null,
          }
        })
      } catch (emailErr) {
        result.email.accounts = result.email.accounts.map((a) => {
          if (!a || a.id !== acc.id) return a
          return {
            ...a,
            total: 0,
            pending: null,
            ok: false,
            error: emailErr?.message || 'connection_failed',
          }
        })
      }
    }

    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/debug/email/sync', async (_req, res) => {
  try {
    settings = await getSettingsFromBackend()
    const account = getActiveEmailAccount(settings)
    if (!account) {
      return res.status(400).json({ error: 'no_active_email_account' })
    }

    const listed = await listEmailCandidates(account)
    if (listed.ok === false) {
      return res.status(400).json({ error: listed.error || 'email_list_failed' })
    }
    const attachments = Array.isArray(listed.attachments) ? listed.attachments : []

    let added = 0
    for (const att of attachments) {
      if (!att?.sourceKey) continue
      const existing = await workflow.inbox.getInvoiceBySourceKey(att.sourceKey)
      if (existing) continue

      const base = String(att.apiUrl || '').replace(/\/$/, '')
      let buf = null
      if (att.provider === 'gmail-oauth') {
        const out = await fetchJsonWithTimeout(
          `${base}/gmail/v1/users/me/messages/${encodeURIComponent(att.messageId)}/attachments/${encodeURIComponent(att.attachmentId)}`,
          {},
          1500
        )
        if (!out.ok || !out.json?.data) {
          continue
        }
        buf = Buffer.from(String(out.json.data), 'base64')
      } else if (att.provider === 'outlook-oauth') {
        const out = await fetchJsonWithTimeout(
          `${base}/v1.0/me/messages/${encodeURIComponent(att.messageId)}/attachments/${encodeURIComponent(att.attachmentId)}`,
          {},
          1500
        )
        if (!out.ok || !out.json?.contentBytes) {
          continue
        }
        buf = Buffer.from(String(out.json.contentBytes), 'base64')
      }
      if (!buf) {
        continue
      }

      await workflow.addManualInvoice('email', buf, {
        fileName: att.fileName || null,
        fileType: att.fileType || null,
        fileSize: att.fileSize != null ? Number(att.fileSize) : buf.length,
        sourceKey: att.sourceKey,
        emailSubject: att.emailSubject || null,
        emailFrom: att.emailFrom || null,
        emailDate: att.emailDate || null,
      })
      added++
    }

    res.json({ added, total: attachments.length })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/debug/devices/scanners/:id/import', async (req, res) => {
  try {
    const scannerId = String(req.params.id || '').trim()
    if (!scannerId) {
      return res.status(400).json({ error: 'scanner_id_required' })
    }

    const scanner = (workflow.deviceSync.scanners || []).find((s) => s && s.id === scannerId)
    if (!scanner || !scanner.apiUrl) {
      return res.status(404).json({ error: 'scanner_not_found' })
    }

    const docs = await workflow.deviceSync.listScannerDocuments(scannerId).catch(() => [])
    const list = Array.isArray(docs) ? docs : []
    const limit = req.body?.limit != null ? Number(req.body.limit) : null
    const sliced = limit && limit > 0 ? list.slice(0, limit) : list

    let added = 0
    for (const d of sliced) {
      const docId = d?.id ? String(d.id) : null
      const fileName = d?.name ? String(d.name) : null
      const fileType = d?.type ? String(d.type) : null
      if (!docId || !fileName) {
        continue
      }
      const sourceKey = `scanner:${scannerId}:${docId}`
      const existing = await workflow.inbox.getInvoiceBySourceKey(sourceKey)
      if (existing) {
        continue
      }

      const base = String(scanner.apiUrl).replace(/\/$/, '')
      const out = await fetchBufferWithTimeout(`${base}/api/documents/${encodeURIComponent(docId)}`, {}, 1500)
      if (!out.ok || !out.buf) {
        continue
      }
      await workflow.addManualInvoice('scanner', out.buf, {
        fileName,
        fileType,
        fileSize: out.buf.length,
        sourceKey,
        scannerName: scanner.name || null,
      })
      added++
    }

    res.json({ added, total: sliced.length })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/debug/storage/sync', async (_req, res) => {
  try {
    if (!workflow?.storageSync || typeof workflow.storageSync.syncNewFiles !== 'function') {
      return res.status(400).json({ error: 'storage_sync_unavailable' })
    }
    const start = Date.now()
    const invoices = await workflow.storageSync.syncNewFiles()
    res.json({ count: Array.isArray(invoices) ? invoices.length : 0, ms: Date.now() - start })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/ui/theme', async (_req, res) => {
  try {
    settings = await getSettingsFromBackend()
    const theme = String(settings?.ui?.theme || 'white')
    res.json({ theme })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.put('/ui/theme', async (req, res) => {
  try {
    settings = await getSettingsFromBackend()
    const nextTheme = String(req.body?.theme || '').trim().toLowerCase()
    if (!UI_THEMES.includes(nextTheme)) {
      return res.status(400).json({ error: 'invalid_theme' })
    }
    const nextSettings = {
      ...settings,
      ui: {
        ...(settings.ui || {}),
        theme: nextTheme,
      },
    }
    await setSettingsToBackend(nextSettings)
    settings = nextSettings
    res.json({ theme: nextTheme })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/ui/contrast/report', async (req, res) => {
  try {
    const palette = normalizePalette(req.body?.palette)
    const checks = buildContrastChecks(palette)
    res.json({ checks })
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/settings', async (_req, res) => {
  try {
    settings = await getSettingsFromBackend()
    res.json(settings)
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.put('/settings', async (req, res) => {
  try {
    const defaults = getDefaultSettings()
    const current = await getSettingsFromBackend()
    const body = req.body && typeof req.body === 'object' ? req.body : {}

    const merged = {
      ...defaults,
      ...current,
      ...body,
      ui: {
        ...defaults.ui,
        ...(current.ui || {}),
        ...(body.ui || {}),
        invoicesTable: {
          ...defaults.ui.invoicesTable,
          ...((current.ui || {}).invoicesTable || {}),
          ...((body.ui || {}).invoicesTable || {}),
        },
      },
      ocr: {
        ...defaults.ocr,
        ...(current.ocr || {}),
        ...(body.ocr || {}),
        api: {
          ...defaults.ocr.api,
          ...((current.ocr || {}).api || {}),
          ...((body.ocr || {}).api || {}),
        },
      },
      channels: {
        ...defaults.channels,
        ...(current.channels || {}),
        ...(body.channels || {}),
        localFolders: {
          ...defaults.channels.localFolders,
          ...((current.channels || {}).localFolders || {}),
          ...((body.channels || {}).localFolders || {}),
        },
        email: {
          ...defaults.channels.email,
          ...((current.channels || {}).email || {}),
          ...((body.channels || {}).email || {}),
        },
        ksef: {
          ...defaults.channels.ksef,
          ...((current.channels || {}).ksef || {}),
          ...((body.channels || {}).ksef || {}),
        },
        remoteStorage: {
          ...defaults.channels.remoteStorage,
          ...((current.channels || {}).remoteStorage || {}),
          ...((body.channels || {}).remoteStorage || {}),
        },
      },
    }

    merged.channels.localFolders.paths = normalizeStringArray(merged.channels.localFolders.paths)
    await setSettingsToBackend(merged)
    settings = merged

    workflow.configureStorage({
      watchPaths: settings.channels.localFolders.paths,
      connections: settings?.channels?.remoteStorage?.connections || [],
    })

    if (workflow?.storageSync && typeof workflow.storageSync.setState === 'function') {
      workflow.storageSync.setState(settings?.channels?.remoteStorage?.state || {})
    }

    applyKsefFromSettings(settings)
    applyEmailFromSettings(settings)
    applyOcrFromSettings(settings)
    applyDevicesFromSettings(settings)

    res.json(settings)
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/data/export', async (_req, res) => {
  try {
    if (!dataLayer) {
      return res.status(400).json({ error: 'sqlite_backend_required' })
    }
    const bundle = await dataLayer.exportBundle()
    res.json(bundle)
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/data/import', async (req, res) => {
  try {
    if (!dataLayer) {
      return res.status(400).json({ error: 'sqlite_backend_required' })
    }
    await dataLayer.importBundle(req.body)
    settings = await getSettingsFromBackend()
    workflow.configureStorage({
      watchPaths: settings.channels.localFolders.paths,
      connections: settings?.channels?.remoteStorage?.connections || [],
    })

    if (workflow?.storageSync && typeof workflow.storageSync.setState === 'function') {
      workflow.storageSync.setState(settings?.channels?.remoteStorage?.state || {})
    }

    applyKsefFromSettings(settings)
    applyEmailFromSettings(settings)
    applyOcrFromSettings(settings)
    applyDevicesFromSettings(settings)
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/data/export/:entity', async (req, res) => {
  try {
    if (!dataLayer) {
      return res.status(400).json({ error: 'sqlite_backend_required' })
    }
    const entity = String(req.params.entity || '').toLowerCase()
    if (entity === 'projects') {
      return res.json({ items: await dataLayer.projects.list() })
    }
    if (entity === 'labels') {
      return res.json({ items: await dataLayer.labels.list() })
    }
    if (entity === 'expense-types' || entity === 'expense_types') {
      return res.json({ items: await dataLayer.expenseTypes.list() })
    }
    if (entity === 'invoices') {
      return res.json({ items: await dataLayer.invoices.list({}) })
    }
    if (entity === 'contractors') {
      return res.json({ items: await dataLayer.contractors.list() })
    }
    if (entity === 'settings') {
      return res.json({ item: await getSettingsFromBackend() })
    }
    return res.status(404).json({ error: 'unknown_entity' })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/data/import/:entity', async (req, res) => {
  try {
    if (!dataLayer) {
      return res.status(400).json({ error: 'sqlite_backend_required' })
    }
    const entity = String(req.params.entity || '').toLowerCase()
    const items = Array.isArray(req.body?.items) ? req.body.items : (Array.isArray(req.body) ? req.body : [])
    if (entity === 'projects') {
      await dataLayer.projects.replaceAll(items)
      return res.json({ ok: true })
    }
    if (entity === 'labels') {
      await dataLayer.labels.replaceAll(items)
      return res.json({ ok: true })
    }
    if (entity === 'expense-types' || entity === 'expense_types') {
      await dataLayer.expenseTypes.replaceAll(items)
      return res.json({ ok: true })
    }
    if (entity === 'invoices') {
      await dataLayer.invoices.replaceAll(items)
      return res.json({ ok: true })
    }
    if (entity === 'contractors') {
      await dataLayer.contractors.replaceAll(items)
      return res.json({ ok: true })
    }
    if (entity === 'settings') {
      const nextSettings = req.body?.item && typeof req.body.item === 'object'
        ? req.body.item
        : (req.body && typeof req.body === 'object' ? req.body : null)
      if (!nextSettings) {
        return res.status(400).json({ error: 'invalid_settings' })
      }
      await setSettingsToBackend(nextSettings)
      settings = await getSettingsFromBackend()
      workflow.configureStorage({
        watchPaths: settings.channels.localFolders.paths,
        connections: settings?.channels?.remoteStorage?.connections || [],
      })

      if (workflow?.storageSync && typeof workflow.storageSync.setState === 'function') {
        workflow.storageSync.setState(settings?.channels?.remoteStorage?.state || {})
      }

      applyKsefFromSettings(settings)
      applyEmailFromSettings(settings)
      applyOcrFromSettings(settings)
      applyDevicesFromSettings(settings)
      return res.json({ ok: true })
    }
    return res.status(404).json({ error: 'unknown_entity' })
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/db/export.sqlite', async (_req, res) => {
  try {
    if (!dataLayer) {
      return res.status(400).json({ error: 'sqlite_backend_required' })
    }
    const buffer = await dataLayer.db.exportFileBuffer()
    res.setHeader('Content-Type', 'application/x-sqlite3')
    res.setHeader('Content-Disposition', 'attachment; filename="exef.sqlite"')
    res.send(buffer)
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/db/import.sqlite', async (req, res) => {
  try {
    if (!dataLayer) {
      return res.status(400).json({ error: 'sqlite_backend_required' })
    }
    const base64 = req.body?.base64
    if (!base64) {
      return res.status(400).json({ error: 'base64_required' })
    }
    const buf = Buffer.from(String(base64), 'base64')
    await dataLayer.db.importFileBuffer(buf)
    settings = await getSettingsFromBackend()
    workflow.configureStorage({
      watchPaths: settings.channels.localFolders.paths,
      connections: settings?.channels?.remoteStorage?.connections || [],
    })

    if (workflow?.storageSync && typeof workflow.storageSync.setState === 'function') {
      workflow.storageSync.setState(settings?.channels?.remoteStorage?.state || {})
    }

    applyKsefFromSettings(settings)
    applyEmailFromSettings(settings)
    applyOcrFromSettings(settings)
    applyDevicesFromSettings(settings)
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

function sanitizePathSegment(value, fallback) {
  const raw = value === null || value === undefined ? '' : String(value)
  const trimmed = raw.trim() || String(fallback || '').trim()
  if (!trimmed) {
    return ''
  }
  const cleaned = trimmed
    .replace(/\.+/g, '.')
    .replace(/[\\/]/g, '_')
    .replace(/[<>:"|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned
}

function getExportEmailSettings(currentSettings) {
  const cfg = currentSettings?.exports?.email && typeof currentSettings.exports.email === 'object'
    ? currentSettings.exports.email
    : {}
  const smtp = cfg?.smtp && typeof cfg.smtp === 'object' ? cfg.smtp : {}
  return {
    to: cfg?.to || null,
    from: cfg?.from || null,
    smtp: {
      host: smtp?.host || null,
      port: smtp?.port != null && smtp.port !== '' ? Number(smtp.port) : null,
      secure: smtp?.secure === true,
      starttls: smtp?.starttls === true,
      user: smtp?.user || null,
      password: smtp?.password || null,
    },
  }
}

function inferFileExtension(fileType) {
  const ft = String(fileType || '').toLowerCase()
  if (ft.includes('pdf')) return '.pdf'
  if (ft.includes('png')) return '.png'
  if (ft.includes('jpeg') || ft.includes('jpg')) return '.jpg'
  if (ft.includes('xml')) return '.xml'
  return ''
}

function toBase64Lines(buf) {
  const b64 = Buffer.from(buf).toString('base64')
  const out = []
  for (let i = 0; i < b64.length; i += 76) {
    out.push(b64.slice(i, i + 76))
  }
  return out.join('\r\n')
}

function buildMimeWithAttachment({ from, to, subject, text, attachmentName, attachmentMimeType, attachmentBuffer }) {
  const boundary = `exef_${Date.now()}_${Math.random().toString(16).slice(2)}`
  const safeSubject = String(subject || 'ExEF export')
  const safeText = String(text || '')
  const safeName = sanitizePathSegment(attachmentName, 'export.bin')
  const mimeType = String(attachmentMimeType || 'application/octet-stream')

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${safeSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
  ]

  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    safeText,
    '',
    `--${boundary}`,
    `Content-Type: ${mimeType}; name="${safeName}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${safeName}"`,
    '',
    toBase64Lines(attachmentBuffer),
    '',
    `--${boundary}--`,
    '',
  ]

  return headers.join('\r\n') + parts.join('\r\n')
}

async function smtpSendMail({ host, port, secure, starttls, user, password, from, to, message }) {
  if (!host || !port) {
    throw new Error('smtp_not_configured')
  }

  let sock = secure
    ? tls.connect({ host, port, servername: host, rejectUnauthorized: false })
    : net.connect({ host, port })

  sock.setTimeout(15000)

  const waitConnect = () => new Promise((resolve, reject) => {
    if (secure) {
      sock.once('secureConnect', resolve)
    } else {
      sock.once('connect', resolve)
    }
    sock.once('error', reject)
    sock.once('timeout', () => reject(new Error('smtp_timeout')))
  })

  await waitConnect()

  let buffer = ''
  const readResponse = () => new Promise((resolve, reject) => {
    const lines = []
    const onData = (chunk) => {
      buffer += chunk.toString('utf8')
      const parts = buffer.split(/\r\n/)
      buffer = parts.pop() || ''

      for (const l of parts) {
        lines.push(l)
        const m = l.match(/^(\d{3})([ -])/) // '-' multiline, ' ' end
        if (m && m[2] === ' ') {
          cleanup()
          resolve({ code: Number(m[1]), text: lines.join('\n') })
          return
        }
      }
    }
    const onErr = (e) => {
      cleanup()
      reject(e)
    }
    const onTimeout = () => {
      cleanup()
      reject(new Error('smtp_timeout'))
    }
    const cleanup = () => {
      sock.off('data', onData)
      sock.off('error', onErr)
      sock.off('timeout', onTimeout)
    }
    sock.on('data', onData)
    sock.on('error', onErr)
    sock.on('timeout', onTimeout)
  })

  const sendLine = (line) => new Promise((resolve, reject) => {
    sock.write(`${line}\r\n`, (err) => {
      if (err) return reject(err)
      resolve()
    })
  })

  const expect = async (codes) => {
    const resp = await readResponse()
    if (!codes.includes(resp.code)) {
      throw new Error(`smtp_unexpected_${resp.code}`)
    }
    return resp
  }

  await expect([220])
  await sendLine('EHLO exef')
  await expect([250])

  if (!secure && starttls) {
    await sendLine('STARTTLS')
    await expect([220])

    sock = tls.connect({ socket: sock, servername: host, rejectUnauthorized: false })
    sock.setTimeout(15000)
    buffer = ''
    await new Promise((resolve, reject) => {
      sock.once('secureConnect', resolve)
      sock.once('error', reject)
      sock.once('timeout', () => reject(new Error('smtp_timeout')))
    })

    await sendLine('EHLO exef')
    await expect([250])
  }

  if (user) {
    await sendLine('AUTH LOGIN')
    await expect([334])
    await sendLine(Buffer.from(String(user)).toString('base64'))
    await expect([334])
    await sendLine(Buffer.from(String(password || '')).toString('base64'))
    await expect([235, 503])
  }

  await sendLine(`MAIL FROM:<${from}>`)
  await expect([250])
  await sendLine(`RCPT TO:<${to}>`)
  await expect([250, 251])
  await sendLine('DATA')
  await expect([354])

  const dotStuffed = String(message)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => (l.startsWith('.') ? `.${l}` : l))
    .join('\r\n')

  await new Promise((resolve, reject) => {
    sock.write(`${dotStuffed}\r\n.\r\n`, (err) => {
      if (err) return reject(err)
      resolve()
    })
  })
  await expect([250])
  await sendLine('QUIT')
  await expect([221, 250])

  try {
    sock.end()
  } catch (_e) {
  }
}

async function buildDocumentsZipBuffer({ status, source, since, ids, projectIds, expenseTypeIds, fileName }) {
  const filter = {
    ...(status === 'all' ? {} : { status: status || INVOICE_STATUS.APPROVED }),
    ...(source ? { source } : {}),
    ...(since ? { since } : {}),
  }

  const invoices = await workflow.listInvoices(filter)

  const idSet = Array.isArray(ids) && ids.length ? new Set(ids.map(String)) : null
  const projectSet = Array.isArray(projectIds) && projectIds.length ? new Set(projectIds.map(String)) : null
  const expenseTypeSet = Array.isArray(expenseTypeIds) && expenseTypeIds.length ? new Set(expenseTypeIds.map(String)) : null

  const filteredInvoices = invoices.filter((inv) => {
    if (!inv || !inv.id) return false
    if (idSet && !idSet.has(String(inv.id))) return false
    if (projectSet && !projectSet.has(String(inv.projectId || ''))) return false
    if (expenseTypeSet && !expenseTypeSet.has(String(inv.expenseTypeId || ''))) return false
    return true
  })

  const expenseTypeMap = new Map()
  const projectMap = new Map()
  if (dataLayer) {
    const expenseTypes = await dataLayer.expenseTypes.list()
    for (const t of expenseTypes) {
      const id = t?.id ? String(t.id) : null
      if (!id) continue
      const name = t?.nazwa ? String(t.nazwa) : ''
      expenseTypeMap.set(id, name)
    }
    const projects = await dataLayer.projects.list()
    for (const p of projects) {
      const id = p?.id ? String(p.id) : null
      if (!id) continue
      const name = p?.nazwa ? String(p.nazwa) : ''
      projectMap.set(id, name)
    }
  }

  let archiver
  try {
    archiver = require('archiver')
  } catch (_e) {
    throw new Error('zip_export_unavailable')
  }

  const { PassThrough } = require('node:stream')
  const out = new PassThrough()
  const chunks = []
  out.on('data', (d) => chunks.push(d))

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const zipNameRaw = fileName ? String(fileName) : `exef_documents_${today}.zip`
  const zipName = sanitizePathSegment(zipNameRaw, `exef_documents_${today}.zip`).replace(/\s+/g, '_')

  await new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } })
    archive.on('warning', (_err) => {
    })
    archive.on('error', (e) => reject(e))
    out.on('error', (e) => reject(e))
    out.on('end', resolve)
    archive.pipe(out)

    ;(async () => {
      for (const inv of filteredInvoices) {
        const invoiceId = String(inv.id)
        const expenseTypeId = inv.expenseTypeId ? String(inv.expenseTypeId) : null
        const projectId = inv.projectId ? String(inv.projectId) : null

        const expenseTypeName = expenseTypeId ? (expenseTypeMap.get(expenseTypeId) || '') : ''
        const projectName = projectId ? (projectMap.get(projectId) || '') : ''

        const expenseFolder = sanitizePathSegment(expenseTypeId ? `${expenseTypeId}${expenseTypeName ? `_${expenseTypeName}` : ''}` : '', 'unassigned-expense-type')
        const projectFolder = sanitizePathSegment(projectId ? `${projectId}${projectName ? `_${projectName}` : ''}` : '', 'unassigned-project')

        let fileBuf = null
        let invFileName = inv.fileName ? String(inv.fileName) : null
        let invFileType = inv.fileType ? String(inv.fileType) : null

        if (dataLayer && typeof dataLayer.invoices.getFile === 'function') {
          const info = await dataLayer.invoices.getFile(invoiceId)
          fileBuf = info?.file || null
          invFileName = info?.fileName || invFileName
          invFileType = info?.fileType || invFileType
        } else {
          const fullInvoice = await workflow.inbox.getInvoice(invoiceId)
          fileBuf = normalizeFileToBufferForExport(fullInvoice?.originalFile)
          invFileName = invFileName || fullInvoice?.fileName || null
          invFileType = invFileType || fullInvoice?.fileType || null
        }

        if (!fileBuf) {
          continue
        }

        let docName = invFileName ? String(invFileName) : null
        if (!docName) {
          const ext = inferFileExtension(invFileType) || ''
          const base = inv.invoiceNumber ? String(inv.invoiceNumber) : invoiceId
          docName = `${base}${ext}`
        }
        docName = sanitizePathSegment(docName, invoiceId)

        const zipPath = `${expenseFolder}/${projectFolder}/${docName}`
        archive.append(fileBuf, { name: zipPath })
      }
      Promise.resolve(archive.finalize()).catch(reject)
    })().catch(reject)
  })

  return { filename: zipName, buffer: Buffer.concat(chunks) }
}

function normalizeFileToBufferForExport(value) {
  if (!value) {
    return null
  }
  if (Buffer.isBuffer(value)) {
    return value
  }
  if (value && typeof value === 'object' && value.type === 'Buffer' && Array.isArray(value.data)) {
    return Buffer.from(value.data)
  }
  if (Array.isArray(value) && value.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    return Buffer.from(value)
  }
  const s = String(value).trim()
  if (!s) {
    return null
  }
  const dataUrlMatch = s.match(/^data:([^;]+);base64,(.*)$/i)
  if (dataUrlMatch) {
    return Buffer.from(dataUrlMatch[2], 'base64')
  }
  const base64Candidate = s.replace(/\s/g, '')
  const looksBase64 = base64Candidate.length % 4 === 0 && /^[a-z0-9+/]+=*$/i.test(base64Candidate)
  if (looksBase64) {
    try {
      return Buffer.from(base64Candidate, 'base64')
    } catch (_e) {
    }
  }
  return Buffer.from(s, 'utf8')
}

app.post('/inbox/export/files', async (req, res) => {
  try {
    const outputDirRaw = req.body?.outputDir || req.body?.baseDir || req.body?.dir
    if (!outputDirRaw) {
      return res.status(400).json({ error: 'outputDir_required' })
    }
    const outputDir = path.resolve(String(outputDirRaw))
    const status = req.body?.status ? String(req.body.status) : INVOICE_STATUS.APPROVED
    const source = req.body?.source ? String(req.body.source) : null
    const since = req.body?.since ? String(req.body.since) : null

    const ids = normalizeStringArray(req.body?.ids)
    const projectIds = normalizeStringArray(req.body?.projectId ?? req.body?.projectIds)
    const expenseTypeIds = normalizeStringArray(req.body?.expenseTypeId ?? req.body?.expenseTypeIds)

    const filter = {
      ...(status === 'all' ? {} : { status }),
      ...(source ? { source } : {}),
      ...(since ? { since } : {}),
    }

    const invoices = await workflow.listInvoices(filter)

    const idSet = ids.length ? new Set(ids) : null
    const projectSet = projectIds.length ? new Set(projectIds) : null
    const expenseTypeSet = expenseTypeIds.length ? new Set(expenseTypeIds) : null

    const filteredInvoices = invoices.filter((inv) => {
      if (!inv || !inv.id) {
        return false
      }
      if (idSet && !idSet.has(String(inv.id))) {
        return false
      }
      if (projectSet && !projectSet.has(String(inv.projectId || ''))) {
        return false
      }
      if (expenseTypeSet && !expenseTypeSet.has(String(inv.expenseTypeId || ''))) {
        return false
      }
      return true
    })

    const expenseTypeMap = new Map()
    const projectMap = new Map()

    if (dataLayer) {
      const expenseTypes = await dataLayer.expenseTypes.list()
      for (const t of expenseTypes) {
        const id = t?.id ? String(t.id) : null
        if (!id) continue
        const name = t?.nazwa ? String(t.nazwa) : ''
        expenseTypeMap.set(id, name)
      }
      const projects = await dataLayer.projects.list()
      for (const p of projects) {
        const id = p?.id ? String(p.id) : null
        if (!id) continue
        const name = p?.nazwa ? String(p.nazwa) : ''
        projectMap.set(id, name)
      }
    }

    let exported = 0
    let skippedNoFile = 0

    for (const inv of filteredInvoices) {
      if (!inv || !inv.id) {
        continue
      }

      const invoiceId = String(inv.id)
      const expenseTypeId = inv.expenseTypeId ? String(inv.expenseTypeId) : null
      const projectId = inv.projectId ? String(inv.projectId) : null

      const expenseTypeName = expenseTypeId ? (expenseTypeMap.get(expenseTypeId) || '') : ''
      const projectName = projectId ? (projectMap.get(projectId) || '') : ''

      const expenseFolder = sanitizePathSegment(expenseTypeId ? `${expenseTypeId}${expenseTypeName ? `_${expenseTypeName}` : ''}` : '', 'unassigned-expense-type')
      const projectFolder = sanitizePathSegment(projectId ? `${projectId}${projectName ? `_${projectName}` : ''}` : '', 'unassigned-project')

      let fileBuf = null
      let fileName = inv.fileName ? String(inv.fileName) : null
      let fileType = inv.fileType ? String(inv.fileType) : null

      if (dataLayer && typeof dataLayer.invoices.getFile === 'function') {
        const info = await dataLayer.invoices.getFile(invoiceId)
        fileBuf = info?.file || null
        fileName = info?.fileName || fileName
        fileType = info?.fileType || fileType
      } else {
        const fullInvoice = await workflow.inbox.getInvoice(invoiceId)
        fileBuf = normalizeFileToBufferForExport(fullInvoice?.originalFile)
        fileName = fileName || fullInvoice?.fileName || null
        fileType = fileType || fullInvoice?.fileType || null
      }

      if (!fileBuf) {
        skippedNoFile++
        continue
      }

      let docName = fileName ? String(fileName) : null
      if (!docName) {
        const ext = inferFileExtension(fileType) || ''
        const base = inv.invoiceNumber ? String(inv.invoiceNumber) : invoiceId
        docName = `${base}${ext}`
      }
      docName = sanitizePathSegment(docName, invoiceId)

      const targetDir = path.join(outputDir, expenseFolder, projectFolder)
      await fs.promises.mkdir(targetDir, { recursive: true })

      let targetPath = path.join(targetDir, docName)
      if (fs.existsSync(targetPath)) {
        const ext = path.extname(docName)
        const base = ext ? docName.slice(0, -ext.length) : docName
        targetPath = path.join(targetDir, `${base}_${invoiceId}${ext}`)
      }

      await fs.promises.writeFile(targetPath, fileBuf)
      exported++
    }

    res.json({ ok: true, outputDir, status, source, since, exported, skippedNoFile, total: invoices.length, matched: filteredInvoices.length })
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/inbox/export/documents.zip', async (req, res) => {
  try {
    const status = req.body?.status ? String(req.body.status) : INVOICE_STATUS.APPROVED
    const source = req.body?.source ? String(req.body.source) : null
    const since = req.body?.since ? String(req.body.since) : null

    const ids = normalizeStringArray(req.body?.ids)
    const projectIds = normalizeStringArray(req.body?.projectId ?? req.body?.projectIds)
    const expenseTypeIds = normalizeStringArray(req.body?.expenseTypeId ?? req.body?.expenseTypeIds)

    const filter = {
      ...(status === 'all' ? {} : { status }),
      ...(source ? { source } : {}),
      ...(since ? { since } : {}),
    }

    const invoices = await workflow.listInvoices(filter)

    const idSet = ids.length ? new Set(ids) : null
    const projectSet = projectIds.length ? new Set(projectIds) : null
    const expenseTypeSet = expenseTypeIds.length ? new Set(expenseTypeIds) : null

    const filteredInvoices = invoices.filter((inv) => {
      if (!inv || !inv.id) {
        return false
      }
      if (idSet && !idSet.has(String(inv.id))) {
        return false
      }
      if (projectSet && !projectSet.has(String(inv.projectId || ''))) {
        return false
      }
      if (expenseTypeSet && !expenseTypeSet.has(String(inv.expenseTypeId || ''))) {
        return false
      }
      return true
    })

    const expenseTypeMap = new Map()
    const projectMap = new Map()
    if (dataLayer) {
      const expenseTypes = await dataLayer.expenseTypes.list()
      for (const t of expenseTypes) {
        const id = t?.id ? String(t.id) : null
        if (!id) continue
        const name = t?.nazwa ? String(t.nazwa) : ''
        expenseTypeMap.set(id, name)
      }
      const projects = await dataLayer.projects.list()
      for (const p of projects) {
        const id = p?.id ? String(p.id) : null
        if (!id) continue
        const name = p?.nazwa ? String(p.nazwa) : ''
        projectMap.set(id, name)
      }
    }

    let archiver
    try {
      archiver = require('archiver')
    } catch (_e) {
      return res.status(400).json({ error: 'zip_export_unavailable' })
    }

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const zipNameRaw = req.body?.fileName ? String(req.body.fileName) : `exef_documents_${today}.zip`
    const zipName = sanitizePathSegment(zipNameRaw, `exef_documents_${today}.zip`).replace(/\s+/g, '_')

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`)

    const archive = archiver('zip', { zlib: { level: 9 } })
    archive.on('warning', (_err) => {
    })
    archive.on('error', (_err) => {
      try {
        res.end()
      } catch (_e) {
      }
    })

    archive.pipe(res)

    for (const inv of filteredInvoices) {
      const invoiceId = String(inv.id)
      const expenseTypeId = inv.expenseTypeId ? String(inv.expenseTypeId) : null
      const projectId = inv.projectId ? String(inv.projectId) : null

      const expenseTypeName = expenseTypeId ? (expenseTypeMap.get(expenseTypeId) || '') : ''
      const projectName = projectId ? (projectMap.get(projectId) || '') : ''

      const expenseFolder = sanitizePathSegment(expenseTypeId ? `${expenseTypeId}${expenseTypeName ? `_${expenseTypeName}` : ''}` : '', 'unassigned-expense-type')
      const projectFolder = sanitizePathSegment(projectId ? `${projectId}${projectName ? `_${projectName}` : ''}` : '', 'unassigned-project')

      let fileBuf = null
      let fileName = inv.fileName ? String(inv.fileName) : null
      let fileType = inv.fileType ? String(inv.fileType) : null

      if (dataLayer && typeof dataLayer.invoices.getFile === 'function') {
        const info = await dataLayer.invoices.getFile(invoiceId)
        fileBuf = info?.file || null
        fileName = info?.fileName || fileName
        fileType = info?.fileType || fileType
      } else {
        const fullInvoice = await workflow.inbox.getInvoice(invoiceId)
        fileBuf = normalizeFileToBufferForExport(fullInvoice?.originalFile)
        fileName = fileName || fullInvoice?.fileName || null
        fileType = fileType || fullInvoice?.fileType || null
      }

      if (!fileBuf) {
        continue
      }

      let docName = fileName ? String(fileName) : null
      if (!docName) {
        const ext = inferFileExtension(fileType) || ''
        const base = inv.invoiceNumber ? String(inv.invoiceNumber) : invoiceId
        docName = `${base}${ext}`
      }
      docName = sanitizePathSegment(docName, invoiceId)

      const zipPath = `${expenseFolder}/${projectFolder}/${docName}`
      archive.append(fileBuf, { name: zipPath })
    }

    await archive.finalize()
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/inbox/export/send-email', async (req, res) => {
  try {
    settings = await getSettingsFromBackend()
    const cfg = getExportEmailSettings(settings)

    const to = req.body?.to ? String(req.body.to) : (cfg.to ? String(cfg.to) : null)
    if (!to) {
      return res.status(400).json({ error: 'export_email_to_required' })
    }

    const smtpCfg = {
      host: req.body?.smtp?.host || cfg.smtp.host,
      port: req.body?.smtp?.port != null ? Number(req.body.smtp.port) : cfg.smtp.port,
      secure: req.body?.smtp?.secure === true || cfg.smtp.secure === true,
      starttls: req.body?.smtp?.starttls === true || cfg.smtp.starttls === true,
      user: req.body?.smtp?.user || cfg.smtp.user,
      password: req.body?.smtp?.password || cfg.smtp.password,
    }

    const fromRaw = req.body?.from ? String(req.body.from) : (cfg.from || smtpCfg.user || 'exef@localhost')
    const from = String(fromRaw)
    const subject = req.body?.subject ? String(req.body.subject) : 'ExEF export'
    const text = req.body?.text ? String(req.body.text) : 'W załączniku znajduje się eksport z ExEF.'

    const type = req.body?.type ? String(req.body.type) : 'documents_zip'

    let attachment
    if (type === 'documents_zip' || type === 'documents.zip') {
      const status = req.body?.status ? String(req.body.status) : INVOICE_STATUS.APPROVED
      const source = req.body?.source ? String(req.body.source) : null
      const since = req.body?.since ? String(req.body.since) : null
      const ids = normalizeStringArray(req.body?.ids)
      const projectIds = normalizeStringArray(req.body?.projectId ?? req.body?.projectIds)
      const expenseTypeIds = normalizeStringArray(req.body?.expenseTypeId ?? req.body?.expenseTypeIds)
      attachment = await buildDocumentsZipBuffer({ status, source, since, ids, projectIds, expenseTypeIds, fileName: req.body?.fileName })
      const message = buildMimeWithAttachment({
        from,
        to,
        subject,
        text,
        attachmentName: attachment.filename,
        attachmentMimeType: 'application/zip',
        attachmentBuffer: attachment.buffer,
      })

      await smtpSendMail({
        host: smtpCfg.host,
        port: smtpCfg.port,
        secure: smtpCfg.secure,
        starttls: smtpCfg.starttls,
        user: smtpCfg.user,
        password: smtpCfg.password,
        from,
        to,
        message,
      })

      return res.json({ ok: true, to, from, subject, filename: attachment.filename, bytes: attachment.buffer.length })
    }

    const format = req.body?.format ? String(req.body.format) : EXPORT_FORMATS.CSV
    const result = await workflow.exportApproved(format, req.body?.options || {})
    if (!result?.content) {
      return res.status(400).json({ error: 'export_empty' })
    }

    const buf = Buffer.isBuffer(result.content) ? result.content : Buffer.from(String(result.content), 'utf8')
    const fileName = result.filename || `export_${format}.${KPIR_EXPORT_FORMATS[format]?.extension || format}`

    const message = buildMimeWithAttachment({
      from,
      to,
      subject,
      text,
      attachmentName: fileName,
      attachmentMimeType: result.mimeType || 'application/octet-stream',
      attachmentBuffer: buf,
    })

    await smtpSendMail({
      host: smtpCfg.host,
      port: smtpCfg.port,
      secure: smtpCfg.secure,
      starttls: smtpCfg.starttls,
      user: smtpCfg.user,
      password: smtpCfg.password,
      from,
      to,
      message,
    })

    res.json({ ok: true, to, from, subject, filename: fileName, bytes: buf.length })
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/contractors', async (_req, res) => {
  try {
    if (!dataLayer) {
      return res.status(400).json({ error: 'sqlite_backend_required' })
    }
    const contractors = await dataLayer.contractors.list()
    res.json({ contractors })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/ksef/auth/token', async (req, res) => {
  try {
    const result = await ksef.authenticateWithKsefToken(req.body)

    const current = await getSettingsFromBackend()
    const accounts = Array.isArray(current?.channels?.ksef?.accounts) ? current.channels.ksef.accounts : []
    const nip = req.body?.nip ? String(req.body.nip) : null
    const requestedAccountId = req.body?.accountId ? String(req.body.accountId) : null

    let account = null
    if (requestedAccountId) {
      account = accounts.find((a) => a && a.id === requestedAccountId) || null
    }
    if (!account && nip) {
      account = accounts.find((a) => a && String(a.nip || '') === nip) || null
    }

    const accountId = account?.id || requestedAccountId || (nip ? `ksef:${nip}` : `ksef:${Date.now()}`)
    const nextAccount = {
      ...(account || {}),
      id: accountId,
      ...(nip ? { nip } : {}),
      accessToken: result?.accessToken || null,
      expiresAt: result?.expiresAt || null,
      environment: result?.environment || null,
      updatedAt: new Date().toISOString(),
    }

    const nextAccounts = (() => {
      const idx = accounts.findIndex((a) => a && a.id === accountId)
      if (idx >= 0) {
        const copy = accounts.slice()
        copy[idx] = { ...copy[idx], ...nextAccount }
        return copy
      }
      return [...accounts, nextAccount]
    })()

    const nextSettings = {
      ...current,
      channels: {
        ...(current.channels || {}),
        ksef: {
          ...((current.channels || {}).ksef || {}),
          accounts: nextAccounts,
          activeAccountId: accountId,
        },
      },
    }
    await setSettingsToBackend(nextSettings)
    settings = nextSettings

    workflow.setKsefAccessToken(result?.accessToken || null)

    res.json({
      ...result,
      accountId,
      saved: true,
    })
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/ksef/sessions/online/open', async (req, res) => {
  try {
    const result = await ksef.openOnlineSession(req.body)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/ksef/sessions/online/close', async (req, res) => {
  try {
    const result = await ksef.closeOnlineSession(req.body)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/ksef/sessions/online/send', async (req, res) => {
  try {
    const result = await ksef.sendOnlineInvoice(req.body)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/ksef/invoices/query', async (req, res) => {
  try {
    const result = await ksef.queryInvoiceMetadata(req.body)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/ksef/invoices/status', async (req, res) => {
  try {
    const result = await ksef.getInvoiceStatus(req.body)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/ksef/invoices/download', async (req, res) => {
  try {
    const result = await ksef.downloadInvoice(req.body)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/inbox/stats', async (_req, res) => {
  try {
    const stats = await workflow.getStats()
    res.json(stats)
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/inbox/invoices', async (req, res) => {
  try {
    const filter = {
      status: req.query.status,
      source: req.query.source,
      since: req.query.since,
    }
    const invoices = await workflow.listInvoices(filter)
    res.json({ invoices, count: invoices.length })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/inbox/invoices/:id', async (req, res) => {
  try {
    const invoice = await workflow.getInvoice(req.params.id)
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' })
    }
    res.json(invoice)
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/inbox/invoices/purge-empty', async (req, res) => {
  try {
    const dryRun = req.body?.dryRun !== false
    const invoices = await workflow.listInvoices({ status: 'all' })

    const candidates = invoices.filter((inv) => !inv || !inv.id)
      ? []
      : invoices

    const deletedIds = []
    for (const inv of candidates) {
      const id = inv?.id ? String(inv.id) : null
      if (!id) {
        continue
      }
      const full = await workflow.getInvoice(id)
      if (full && full.originalFile) {
        continue
      }
      if (!dryRun) {
        await workflow.inbox.deleteInvoice(id)
      }
      deletedIds.push(id)
    }

    res.json({ ok: true, dryRun, deleted: deletedIds.length, deletedIds })
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/inbox/invoices', async (req, res) => {
  try {
    const { source, file, metadata } = req.body
    const invoice = await workflow.addManualInvoice(source || 'scanner', file, metadata || {})
    res.status(201).json(invoice)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/inbox/invoices/:id/process', async (req, res) => {
  try {
    const invoice = await workflow.processInvoice(req.params.id)
    res.json(invoice)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/inbox/invoices/:id/approve', async (req, res) => {
  try {
    const invoice = await workflow.approveInvoice(req.params.id, req.body)
    res.json(invoice)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/inbox/invoices/:id/reject', async (req, res) => {
  try {
    const invoice = await workflow.rejectInvoice(req.params.id, req.body.reason)
    res.json(invoice)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.delete('/inbox/invoices/:id', async (req, res) => {
  try {
    const result = await workflow.deleteInvoice(req.params.id)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/inbox/export/formats', async (_req, res) => {
  try {
    const coreFormats = [
      { id: EXPORT_FORMATS.CSV, name: 'CSV', extension: 'csv', mimeType: 'text/csv;charset=utf-8' },
      { id: EXPORT_FORMATS.JSON, name: 'JSON', extension: 'json', mimeType: 'application/json' },
      { id: EXPORT_FORMATS.XLSX, name: 'XLSX', extension: 'xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', binary: true },
      { id: EXPORT_FORMATS.WFIRMA, name: 'wFirma (API)', extension: '', mimeType: 'application/json' },
    ]

    const kpirFormats = Object.entries(KPIR_EXPORT_FORMATS).map(([id, cfg]) => ({ id, ...cfg }))

    res.json({ formats: [...coreFormats, ...kpirFormats] })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/inbox/export', async (req, res) => {
  try {
    const format = req.body.format || EXPORT_FORMATS.CSV
    const result = await workflow.exportApproved(format, req.body.options || {})
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/inbox/export/download', async (req, res) => {
  try {
    const format = req.body?.format ? String(req.body.format) : EXPORT_FORMATS.CSV
    const result = await workflow.exportApproved(format, req.body?.options || {})

    const content = result?.content
    if (!content) {
      return res.status(400).json({ error: 'export_empty' })
    }

    const defaultExt = (KPIR_EXPORT_FORMATS[format]?.extension) || (format === EXPORT_FORMATS.CSV ? 'csv' : format === EXPORT_FORMATS.JSON ? 'json' : format)
    const fallbackName = `export_${format}${defaultExt ? `.${defaultExt}` : ''}`
    const name = sanitizePathSegment(result?.filename || fallbackName, fallbackName)

    res.setHeader('Content-Type', result?.mimeType || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`)

    if (Buffer.isBuffer(content)) {
      return res.send(content)
    }
    if (content && typeof content === 'object' && Array.isArray(content.data)) {
      return res.send(Buffer.from(content.data))
    }
    return res.send(String(content))
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/inbox/export.csv', async (_req, res) => {
  try {
    const result = await workflow.exportApproved(EXPORT_FORMATS.CSV, {})
    const content = result?.content || ''
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="faktury_zatwierdzone.csv"')
    res.send(content)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/inbox/ksef/poll', async (req, res) => {
  try {
    const { accessToken, since, until } = req.body
    const invoices = await ksef.pollNewInvoices({ accessToken, since, until })
    let added = 0
    for (const invData of invoices) {
      const ksefKey = invData?.ksefReferenceNumber || invData?.ksefId || null
      if (!ksefKey) {
        continue
      }

      try {
        const downloaded = await ksef.downloadInvoice({
          accessToken,
          ksefReferenceNumber: String(ksefKey),
          format: 'xml',
        })
        const xmlText = downloaded?.format === 'xml' ? downloaded.data : null
        if (!xmlText || !String(xmlText).trim()) {
          continue
        }
        await workflow.addManualInvoice('ksef', String(xmlText), {
          ...invData,
          sourceKey: `ksef:${String(ksefKey)}`,
          fileName: `ksef_${String(ksefKey)}.xml`,
          fileType: downloaded?.contentType || 'application/xml',
          fileSize: Buffer.byteLength(String(xmlText), 'utf8'),
        })
        added++
      } catch (_e) {
        continue
      }
    }
    res.json({ added, invoices })
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

// Projects management endpoints
app.get('/projects', async (_req, res) => {
  try {
    if (dataLayer) {
      const projects = await dataLayer.projects.list()
      return res.json({ projects })
    }
    if (!fs.existsSync(projectsFilePath)) {
      return res.json({ projects: [] })
    }
    
    const content = fs.readFileSync(projectsFilePath, 'utf8')
    const lines = content.split('\n').filter(line => line.trim())
    
    if (lines.length < 2) {
      return res.json({ projects: [] })
    }
    
    const headers = lines[0].split(',').map(h => h.trim())
    const projects = []
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      if (values.length === headers.length && values[0]) {
        const project = {}
        headers.forEach((header, index) => {
          project[header.toLowerCase()] = values[index]
        })
        projects.push(project)
      }
    }
    
    res.json({ projects })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/projects/import', async (req, res) => {
  try {
    const items = normalizeProjectsImportItems(req.body?.items || req.body)
    if (!items.length) {
      return res.status(400).json({ error: 'no_items' })
    }

    if (dataLayer) {
      let created = 0
      let updated = 0
      for (const p of items) {
        const existing = await dataLayer.projects.get(p.id)
        await dataLayer.projects.upsert({
          ...(existing || {}),
          ...p,
        })
        if (existing) {
          updated++
        } else {
          created++
        }
      }
      const projects = await dataLayer.projects.list()
      return res.json({ ok: true, created, updated, total: projects.length })
    }

    const existingMap = new Map()
    if (fs.existsSync(projectsFilePath)) {
      const content = fs.readFileSync(projectsFilePath, 'utf8')
      const lines = content.split('\n').filter((line) => line.trim())
      if (lines.length >= 2) {
        for (let i = 1; i < lines.length; i++) {
          const values = parseCsvLine(lines[i])
          const id = values[0] ? String(values[0]).trim() : ''
          if (!id) continue
          existingMap.set(id, {
            id,
            nazwa: values[1] || '',
            klient: values[2] || '',
            nip: values[3] || '',
            budzet: values[4] || 0,
            status: values[5] || 'aktywny',
            opis: values[6] || '',
          })
        }
      }
    }

    let created = 0
    let updated = 0
    for (const p of items) {
      if (existingMap.has(p.id)) {
        updated++
      } else {
        created++
      }
      existingMap.set(p.id, p)
    }

    const header = 'ID,Nazwa,Klient,NIP,Budżet,Status,Opis'
    const lines = [header]
    for (const p of Array.from(existingMap.values())) {
      lines.push(
        `${csvEscape(p.id)},${csvEscape(p.nazwa)},${csvEscape(p.klient || '')},${csvEscape(p.nip || '')},${csvEscape(p.budzet != null ? p.budzet : 0)},${csvEscape(p.status || 'aktywny')},${csvEscape(p.opis || '')}`
      )
    }
    fs.mkdirSync(path.dirname(projectsFilePath), { recursive: true })
    fs.writeFileSync(projectsFilePath, lines.join('\n'), 'utf8')
    return res.json({ ok: true, created, updated, total: existingMap.size })
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/expense-types', async (_req, res) => {
  try {
    if (dataLayer) {
      const expenseTypes = await dataLayer.expenseTypes.list()
      return res.json({ expenseTypes })
    }
    if (!fs.existsSync(expenseTypesFilePath)) {
      return res.json({ expenseTypes: [] })
    }

    const content = fs.readFileSync(expenseTypesFilePath, 'utf8')
    const lines = content.split('\n').filter(line => line.trim())

    if (lines.length < 2) {
      return res.json({ expenseTypes: [] })
    }

    const headers = lines[0].split(',').map(h => h.trim())
    const expenseTypes = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      if (values.length === headers.length && values[0]) {
        const expenseType = {}
        headers.forEach((header, index) => {
          expenseType[header.toLowerCase()] = values[index]
        })
        expenseTypes.push(expenseType)
      }
    }

    res.json({ expenseTypes })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

 app.post('/expense-types', async (req, res) => {
  try {
    const { id, nazwa, opis } = req.body

    if (!id || !nazwa) {
      return res.status(400).json({ error: 'ID and Nazwa are required' })
    }

    if (dataLayer) {
      const exists = await dataLayer.expenseTypes.get(id)
      if (exists) {
        return res.status(400).json({ error: 'Expense type with this ID already exists' })
      }
      await dataLayer.expenseTypes.upsert({ id, nazwa, opis: opis || '' })
      return res.status(201).json({ id, nazwa, opis, message: 'Expense type created successfully' })
    }

    let lines = []

    if (fs.existsSync(expenseTypesFilePath)) {
      const content = fs.readFileSync(expenseTypesFilePath, 'utf8')
      lines = content.split('\n').filter(line => line.trim())

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
        if (values[0] === id) {
          return res.status(400).json({ error: 'Expense type with this ID already exists' })
        }
      }
    }

    if (lines.length === 0) {
      lines = ['ID,Nazwa,Opis']
    }

    lines.push(`${id},"${nazwa}","${opis || ''}"`)
    fs.mkdirSync(path.dirname(expenseTypesFilePath), { recursive: true })
    fs.writeFileSync(expenseTypesFilePath, lines.join('\n'), 'utf8')

    res.status(201).json({
      id,
      nazwa,
      opis,
      message: 'Expense type created successfully'
    })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.put('/expense-types/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { nazwa, opis } = req.body

    if (dataLayer) {
      const current = await dataLayer.expenseTypes.get(id)
      if (!current) {
        return res.status(404).json({ error: 'Expense type not found' })
      }
      const updated = { ...current, ...(nazwa !== undefined ? { nazwa } : {}), ...(opis !== undefined ? { opis } : {}) }
      await dataLayer.expenseTypes.upsert(updated)
      return res.json({ id, nazwa, opis, message: 'Expense type updated successfully' })
    }

    if (!fs.existsSync(expenseTypesFilePath)) {
      return res.status(404).json({ error: 'Expense types file not found' })
    }

    const content = fs.readFileSync(expenseTypesFilePath, 'utf8')
    const lines = content.split('\n').filter(line => line.trim())

    if (lines.length < 2) {
      return res.status(404).json({ error: 'No expense types found' })
    }

    let found = false
    const updatedLines = [lines[0]]

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      if (values[0] === id) {
        found = true
        const updatedExpenseType = {
          id,
          nazwa: nazwa || values[1],
          opis: opis || values[2]
        }
        const updatedLine = `${id},"${updatedExpenseType.nazwa}","${updatedExpenseType.opis}"`
        updatedLines.push(updatedLine)
      } else {
        updatedLines.push(lines[i])
      }
    }

    if (!found) {
      return res.status(404).json({ error: 'Expense type not found' })
    }

    fs.writeFileSync(expenseTypesFilePath, updatedLines.join('\n'), 'utf8')

    res.json({
      id,
      nazwa,
      opis,
      message: 'Expense type updated successfully'
    })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.delete('/expense-types/:id', async (req, res) => {
  try {
    const { id } = req.params

    if (dataLayer) {
      const current = await dataLayer.expenseTypes.get(id)
      if (!current) {
        return res.status(404).json({ error: 'Expense type not found' })
      }
      await dataLayer.expenseTypes.delete(id)
      return res.json({ message: 'Expense type deleted successfully' })
    }

    if (!fs.existsSync(expenseTypesFilePath)) {
      return res.status(404).json({ error: 'Expense types file not found' })
    }

    const content = fs.readFileSync(expenseTypesFilePath, 'utf8')
    const lines = content.split('\n').filter(line => line.trim())

    if (lines.length < 2) {
      return res.status(404).json({ error: 'No expense types found' })
    }

    let found = false
    const updatedLines = [lines[0]]

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      if (values[0] !== id) {
        updatedLines.push(lines[i])
      } else {
        found = true
      }
    }

    if (!found) {
      return res.status(404).json({ error: 'Expense type not found' })
    }

    fs.writeFileSync(expenseTypesFilePath, updatedLines.join('\n'), 'utf8')

    res.json({ message: 'Expense type deleted successfully' })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/labels', async (_req, res) => {
  try {
    if (dataLayer) {
      const labels = await dataLayer.labels.list()
      return res.json({ labels })
    }
    if (!fs.existsSync(labelsFilePath)) {
      return res.json({ labels: [] })
    }

    const content = fs.readFileSync(labelsFilePath, 'utf8')
    const lines = content.split('\n').filter(line => line.trim())

    if (lines.length < 2) {
      return res.json({ labels: [] })
    }

    const headers = lines[0].split(',').map(h => h.trim())
    const labels = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      if (values.length === headers.length && values[0]) {
        const label = {}
        headers.forEach((header, index) => {
          label[header.toLowerCase()] = values[index]
        })
        labels.push(label)
      }
    }

    res.json({ labels })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/labels/import', async (req, res) => {
  try {
    const items = normalizeLabelsImportItems(req.body?.items || req.body)
    if (!items.length) {
      return res.status(400).json({ error: 'no_items' })
    }

    if (dataLayer) {
      let created = 0
      let updated = 0
      for (const l of items) {
        const existing = await dataLayer.labels.get(l.id)
        await dataLayer.labels.upsert({
          ...(existing || {}),
          ...l,
        })
        if (existing) {
          updated++
        } else {
          created++
        }
      }
      const labels = await dataLayer.labels.list()
      return res.json({ ok: true, created, updated, total: labels.length })
    }

    const existingMap = new Map()
    if (fs.existsSync(labelsFilePath)) {
      const content = fs.readFileSync(labelsFilePath, 'utf8')
      const lines = content.split('\n').filter((line) => line.trim())
      if (lines.length >= 2) {
        for (let i = 1; i < lines.length; i++) {
          const values = parseCsvLine(lines[i])
          const id = values[0] ? String(values[0]).trim() : ''
          if (!id) continue
          existingMap.set(id, {
            id,
            nazwa: values[1] || '',
            kolor: values[2] || '',
            opis: values[3] || '',
          })
        }
      }
    }

    let created = 0
    let updated = 0
    for (const l of items) {
      if (existingMap.has(l.id)) {
        updated++
      } else {
        created++
      }
      existingMap.set(l.id, l)
    }

    const header = 'ID,Nazwa,Kolor,Opis'
    const lines = [header]
    for (const l of Array.from(existingMap.values())) {
      lines.push(
        `${csvEscape(l.id)},${csvEscape(l.nazwa)},${csvEscape(l.kolor || '')},${csvEscape(l.opis || '')}`
      )
    }
    fs.mkdirSync(path.dirname(labelsFilePath), { recursive: true })
    fs.writeFileSync(labelsFilePath, lines.join('\n'), 'utf8')
    return res.json({ ok: true, created, updated, total: existingMap.size })
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/labels', async (req, res) => {
  try {
    const { id, nazwa, kolor, opis } = req.body

    if (!id || !nazwa) {
      return res.status(400).json({ error: 'ID and Nazwa are required' })
    }

    if (dataLayer) {
      const exists = await dataLayer.labels.get(id)
      if (exists) {
        return res.status(400).json({ error: 'Label with this ID already exists' })
      }
      await dataLayer.labels.upsert({ id, nazwa, kolor: kolor || '', opis: opis || '' })
      return res.status(201).json({ id, nazwa, kolor, opis, message: 'Label created successfully' })
    }

    let lines = []

    if (fs.existsSync(labelsFilePath)) {
      const content = fs.readFileSync(labelsFilePath, 'utf8')
      lines = content.split('\n').filter(line => line.trim())

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
        if (values[0] === id) {
          return res.status(400).json({ error: 'Label with this ID already exists' })
        }
      }
    }

    if (lines.length === 0) {
      lines = ['ID,Nazwa,Kolor,Opis']
    }

    lines.push(`${id},"${nazwa}","${kolor || ''}","${opis || ''}"`)
    fs.mkdirSync(path.dirname(labelsFilePath), { recursive: true })
    fs.writeFileSync(labelsFilePath, lines.join('\n'), 'utf8')

    res.status(201).json({ id, nazwa, kolor, opis, message: 'Label created successfully' })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.put('/labels/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { nazwa, kolor, opis } = req.body

    if (dataLayer) {
      const current = await dataLayer.labels.get(id)
      if (!current) {
        return res.status(404).json({ error: 'Label not found' })
      }
      const updated = {
        ...current,
        ...(nazwa !== undefined ? { nazwa } : {}),
        ...(kolor !== undefined ? { kolor } : {}),
        ...(opis !== undefined ? { opis } : {}),
      }
      await dataLayer.labels.upsert(updated)
      return res.json({ id, nazwa, kolor, opis, message: 'Label updated successfully' })
    }

    if (!fs.existsSync(labelsFilePath)) {
      return res.status(404).json({ error: 'Labels file not found' })
    }

    const content = fs.readFileSync(labelsFilePath, 'utf8')
    const lines = content.split('\n').filter(line => line.trim())

    if (lines.length < 2) {
      return res.status(404).json({ error: 'No labels found' })
    }

    let found = false
    const updatedLines = [lines[0]]

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      if (values[0] === id) {
        found = true
        const updatedLabel = {
          id,
          nazwa: nazwa || values[1],
          kolor: kolor || values[2],
          opis: opis || values[3],
        }
        const updatedLine = `${id},"${updatedLabel.nazwa}","${updatedLabel.kolor}","${updatedLabel.opis}"`
        updatedLines.push(updatedLine)
      } else {
        updatedLines.push(lines[i])
      }
    }

    if (!found) {
      return res.status(404).json({ error: 'Label not found' })
    }

    fs.writeFileSync(labelsFilePath, updatedLines.join('\n'), 'utf8')
    res.json({ id, nazwa, kolor, opis, message: 'Label updated successfully' })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.delete('/labels/:id', async (req, res) => {
  try {
    const { id } = req.params

    if (dataLayer) {
      const current = await dataLayer.labels.get(id)
      if (!current) {
        return res.status(404).json({ error: 'Label not found' })
      }
      await dataLayer.labels.delete(id)
      return res.json({ message: 'Label deleted successfully' })
    }

    if (!fs.existsSync(labelsFilePath)) {
      return res.status(404).json({ error: 'Labels file not found' })
    }

    const content = fs.readFileSync(labelsFilePath, 'utf8')
    const lines = content.split('\n').filter(line => line.trim())

    if (lines.length < 2) {
      return res.status(404).json({ error: 'No labels found' })
    }

    let found = false
    const updatedLines = [lines[0]]

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      if (values[0] !== id) {
        updatedLines.push(lines[i])
      } else {
        found = true
      }
    }

    if (!found) {
      return res.status(404).json({ error: 'Label not found' })
    }

    fs.writeFileSync(labelsFilePath, updatedLines.join('\n'), 'utf8')
    res.json({ message: 'Label deleted successfully' })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/inbox/invoices/:id/assign', async (req, res) => {
  try {
    const projectId = req.body && typeof req.body === 'object' ? (req.body.projectId ?? null) : null
    const normalized = projectId ? String(projectId) : null
    const invoice = await workflow.assignInvoiceToProject(req.params.id, normalized)
    res.json(invoice)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/inbox/invoices/:id/assign-expense-type', async (req, res) => {
  try {
    const { expenseTypeId } = req.body
    const normalized = expenseTypeId ? String(expenseTypeId) : null
    const invoice = await workflow.assignInvoiceToExpenseType(req.params.id, normalized)
    res.json(invoice)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/inbox/invoices/:id/assign-labels', async (req, res) => {
  try {
    const labelIds = normalizeStringArray(req.body?.labelIds)
    const invoice = await workflow.assignInvoiceToLabels(req.params.id, labelIds)
    res.json(invoice)
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/projects', async (req, res) => {
  try {
    const { id, nazwa, klient, nip, budzet, status, opis } = req.body
    
    if (!id || !nazwa) {
      return res.status(400).json({ error: 'ID and Nazwa are required' })
    }

    if (dataLayer) {
      const exists = await dataLayer.projects.get(id)
      if (exists) {
        return res.status(400).json({ error: 'Project with this ID already exists' })
      }
      await dataLayer.projects.upsert({
        id,
        nazwa,
        klient: klient || '',
        nip: nip || '',
        budzet: budzet || 0,
        status: status || 'aktywny',
        opis: opis || '',
      })
      return res.status(201).json({ 
        id, 
        nazwa, 
        klient, 
        nip, 
        budzet, 
        status, 
        opis,
        message: 'Project created successfully' 
      })
    }
    
    let lines = []

    if (fs.existsSync(projectsFilePath)) {
      const content = fs.readFileSync(projectsFilePath, 'utf8')
      lines = content.split('\n').filter(line => line.trim())

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
        if (values[0] === id) {
          return res.status(400).json({ error: 'Project with this ID already exists' })
        }
      }
    }

    if (lines.length === 0) {
      lines = ['ID,Nazwa,Klient,NIP,Budżet,Status,Opis']
    }

    lines.push(`${id},"${nazwa}","${klient || ''}","${nip || ''}",${budzet || 0},"${status || 'aktywny'}","${opis || ''}"`)
    fs.mkdirSync(path.dirname(projectsFilePath), { recursive: true })
    fs.writeFileSync(projectsFilePath, lines.join('\n'), 'utf8')

    res.status(201).json({ 
      id, 
      nazwa, 
      klient, 
      nip, 
      budzet, 
      status, 
      opis,
      message: 'Project created successfully' 
    })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.put('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { nazwa, klient, nip, budzet, status, opis } = req.body

    if (dataLayer) {
      const current = await dataLayer.projects.get(id)
      if (!current) {
        return res.status(404).json({ error: 'Project not found' })
      }
      const updated = {
        ...current,
        ...(nazwa !== undefined ? { nazwa } : {}),
        ...(klient !== undefined ? { klient } : {}),
        ...(nip !== undefined ? { nip } : {}),
        ...(budzet !== undefined ? { budzet } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(opis !== undefined ? { opis } : {}),
      }
      await dataLayer.projects.upsert(updated)
      return res.json({ id, nazwa, klient, nip, budzet, status, opis, message: 'Project updated successfully' })
    }
    
    if (!fs.existsSync(projectsFilePath)) {
      return res.status(404).json({ error: 'Projects file not found' })
    }
    
    const content = fs.readFileSync(projectsFilePath, 'utf8')
    const lines = content.split('\n').filter(line => line.trim())
    
    if (lines.length < 2) {
      return res.status(404).json({ error: 'No projects found' })
    }
    
    let projectFound = false
    const updatedLines = [lines[0]] // Keep header
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      if (values[0] === id) {
        projectFound = true
        const updatedProject = {
          id,
          nazwa: nazwa || values[1],
          klient: klient || values[2],
          nip: nip || values[3],
          budzet: budzet || values[4],
          status: status || values[5],
          opis: opis || values[6]
        }
        const updatedLine = `${id},"${updatedProject.nazwa}","${updatedProject.klient}","${updatedProject.nip}",${updatedProject.budzet},"${updatedProject.status}","${updatedProject.opis}"`
        updatedLines.push(updatedLine)
      } else {
        updatedLines.push(lines[i])
      }
    }
    
    if (!projectFound) {
      return res.status(404).json({ error: 'Project not found' })
    }
    
    fs.writeFileSync(projectsFilePath, updatedLines.join('\n'), 'utf8')
    
    res.json({ 
      id, 
      nazwa, 
      klient, 
      nip, 
      budzet, 
      status, 
      opis,
      message: 'Project updated successfully' 
    })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.delete('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params

    if (dataLayer) {
      const current = await dataLayer.projects.get(id)
      if (!current) {
        return res.status(404).json({ error: 'Project not found' })
      }
      await dataLayer.projects.delete(id)
      return res.json({ message: 'Project deleted successfully' })
    }
    
    if (!fs.existsSync(projectsFilePath)) {
      return res.status(404).json({ error: 'Projects file not found' })
    }
    
    const content = fs.readFileSync(projectsFilePath, 'utf8')
    const lines = content.split('\n').filter(line => line.trim())
    
    if (lines.length < 2) {
      return res.status(404).json({ error: 'No projects found' })
    }
    
    let projectFound = false
    const updatedLines = [lines[0]] // Keep header
    
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      if (values[0] !== id) {
        updatedLines.push(lines[i])
      } else {
        projectFound = true
      }
    }
    
    if (!projectFound) {
      return res.status(404).json({ error: 'Project not found' })
    }
    
    fs.writeFileSync(projectsFilePath, updatedLines.join('\n'), 'utf8')
    
    res.json({ message: 'Project deleted successfully' })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

// Device endpoints (scanners and printers)
app.get('/devices', async (_req, res) => {
  try {
    const status = await workflow.deviceSync.getAllDevicesStatus()
    res.json(status)
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/devices/scanners', async (_req, res) => {
  try {
    const scanners = workflow.deviceSync.scanners || []
    const statuses = await Promise.all(
      scanners.map(async (s) => ({
        ...s,
        ...(await workflow.deviceSync.getScannerStatus(s.id)),
      }))
    )
    res.json({ scanners: statuses })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/devices/scanners/:id', async (req, res) => {
  try {
    const status = await workflow.deviceSync.getScannerStatus(req.params.id)
    res.json(status)
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/devices/scanners/:id/scan', async (req, res) => {
  try {
    const options = req.body || {}
    const result = await workflow.deviceSync.scanDocument(req.params.id, options)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/devices/scanners/:id/documents', async (req, res) => {
  try {
    const documents = await workflow.deviceSync.listScannerDocuments(req.params.id)
    res.json({ documents })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/devices/printers', async (_req, res) => {
  try {
    const printers = workflow.deviceSync.printers || []
    const statuses = await Promise.all(
      printers.map(async (p) => ({
        ...p,
        ...(await workflow.deviceSync.getPrinterStatus(p.id)),
      }))
    )
    res.json({ printers: statuses })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/devices/printers/:id', async (req, res) => {
  try {
    const info = await workflow.deviceSync.getPrinterInfo(req.params.id)
    res.json(info)
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/devices/printers/:id/print', async (req, res) => {
  try {
    const { document, copies, duplex, colorMode, paperSize } = req.body || {}
    if (!document) {
      return res.status(400).json({ error: 'document_required' })
    }
    const result = await workflow.deviceSync.printDocument(req.params.id, document, {
      copies, duplex, colorMode, paperSize,
    })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/devices/printers/:id/jobs', async (req, res) => {
  try {
    const jobs = await workflow.deviceSync.getPrintJobs(req.params.id)
    res.json({ jobs })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/devices/printers/:id/jobs/:jobId', async (req, res) => {
  try {
    const job = await workflow.deviceSync.getPrintJobStatus(req.params.id, req.params.jobId)
    res.json(job)
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/devices/printers/:id/jobs/:jobId/cancel', async (req, res) => {
  try {
    const result = await workflow.deviceSync.cancelPrintJob(req.params.id, req.params.jobId)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

// Print invoice directly
app.post('/inbox/invoices/:id/print', async (req, res) => {
  try {
    const invoice = await workflow.getInvoice(req.params.id)
    if (!invoice) {
      return res.status(404).json({ error: 'invoice_not_found' })
    }
    
    const { printerId, copies, duplex, colorMode, paperSize } = req.body || {}
    if (!printerId) {
      return res.status(400).json({ error: 'printer_id_required' })
    }

    const document = {
      fileName: invoice.fileName || 'invoice.pdf',
      fileType: invoice.fileType || 'application/pdf',
      content: invoice.originalFile,
    }

    const result = await workflow.deviceSync.printDocument(printerId, document, {
      copies, duplex, colorMode, paperSize,
    })
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

// ============================================
// Accounts CRUD API
// ============================================

const ACCOUNT_TYPES = ['ksef', 'email', 'storage', 'local-folders', 'scanners', 'printers']

function accountTypeToSettingsPath(type) {
  switch (type) {
    case 'ksef': return { key: 'ksef', field: 'accounts' }
    case 'email': return { key: 'email', field: 'accounts' }
    case 'storage': return { key: 'remoteStorage', field: 'connections' }
    case 'scanners': return { key: 'devices', field: 'scanners' }
    case 'printers': return { key: 'devices', field: 'printers' }
    default: return null
  }
}

function getAccountsList(currentSettings, type) {
  if (type === 'local-folders') {
    const paths = currentSettings?.channels?.localFolders?.paths || []
    return paths.map((p, i) => ({ id: `local-folder-${i}`, type: 'local-folder', path: p, enabled: true }))
  }
  const mapping = accountTypeToSettingsPath(type)
  if (!mapping) return []
  const section = currentSettings?.channels?.[mapping.key]
  return Array.isArray(section?.[mapping.field]) ? section[mapping.field] : []
}

function setAccountsList(currentSettings, type, list) {
  const next = { ...currentSettings, channels: { ...(currentSettings.channels || {}) } }
  if (type === 'local-folders') {
    next.channels.localFolders = { ...(next.channels.localFolders || {}), paths: list.map((a) => a.path || a.id) }
    return next
  }
  const mapping = accountTypeToSettingsPath(type)
  if (!mapping) return next
  next.channels[mapping.key] = { ...(next.channels[mapping.key] || {}), [mapping.field]: list }
  return next
}

app.get('/accounts', async (_req, res) => {
  try {
    const current = await getSettingsFromBackend()
    const result = {}
    for (const type of ACCOUNT_TYPES) {
      result[type] = getAccountsList(current, type)
    }
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.get('/accounts/:type', async (req, res) => {
  try {
    const type = req.params.type
    if (!ACCOUNT_TYPES.includes(type)) {
      return res.status(400).json({ error: `invalid_account_type: ${type}`, valid: ACCOUNT_TYPES })
    }
    const current = await getSettingsFromBackend()
    const accounts = getAccountsList(current, type)
    res.json({ type, accounts })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/accounts/:type', async (req, res) => {
  try {
    const type = req.params.type
    if (!ACCOUNT_TYPES.includes(type)) {
      return res.status(400).json({ error: `invalid_account_type: ${type}`, valid: ACCOUNT_TYPES })
    }
    const body = req.body || {}
    const current = await getSettingsFromBackend()
    const existing = getAccountsList(current, type)

    if (type === 'local-folders') {
      const newPath = String(body.path || '').trim()
      if (!newPath) {
        return res.status(400).json({ error: 'path_required' })
      }
      if (existing.some((a) => a.path === newPath)) {
        return res.status(409).json({ error: 'path_already_exists' })
      }
      const nextList = [...existing, { id: `local-folder-${existing.length}`, type: 'local-folder', path: newPath, enabled: true }]
      const nextSettings = setAccountsList(current, type, nextList)
      await setSettingsToBackend(nextSettings)
      settings = nextSettings
      workflow.configureStorage({
        watchPaths: nextSettings.channels.localFolders.paths,
        connections: nextSettings?.channels?.remoteStorage?.connections || [],
      })
      return res.status(201).json({ ok: true, account: nextList[nextList.length - 1] })
    }

    const id = body.id || `${type}-${Date.now()}`
    if (existing.some((a) => a && a.id === id)) {
      return res.status(409).json({ error: 'account_id_already_exists', id })
    }

    const newAccount = { ...body, id, enabled: body.enabled !== false, createdAt: new Date().toISOString() }
    const nextList = [...existing, newAccount]
    const nextSettings = setAccountsList(current, type, nextList)

    // Set active account if this is the first one
    if (type === 'ksef' && nextList.length === 1) {
      nextSettings.channels.ksef = { ...(nextSettings.channels.ksef || {}), activeAccountId: id }
    }
    if (type === 'email' && nextList.length === 1) {
      nextSettings.channels.email = { ...(nextSettings.channels.email || {}), activeAccountId: id }
    }

    await setSettingsToBackend(nextSettings)
    settings = nextSettings

    // Reconfigure workflow
    if (type === 'storage') {
      workflow.configureStorage({
        watchPaths: nextSettings.channels?.localFolders?.paths || [],
        connections: nextSettings.channels?.remoteStorage?.connections || [],
      })
    } else if (type === 'ksef') {
      applyKsefFromSettings(nextSettings)
    } else if (type === 'email') {
      applyEmailFromSettings(nextSettings)
    } else if (type === 'scanners' || type === 'printers') {
      applyDevicesFromSettings(nextSettings)
    }

    res.status(201).json({ ok: true, account: newAccount })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.put('/accounts/:type/:id', async (req, res) => {
  try {
    const type = req.params.type
    const id = req.params.id
    if (!ACCOUNT_TYPES.includes(type)) {
      return res.status(400).json({ error: `invalid_account_type: ${type}`, valid: ACCOUNT_TYPES })
    }

    const body = req.body || {}
    const current = await getSettingsFromBackend()
    const existing = getAccountsList(current, type)

    if (type === 'local-folders') {
      const idx = existing.findIndex((a) => a.id === id || a.path === id)
      if (idx < 0) {
        return res.status(404).json({ error: 'folder_not_found' })
      }
      const updated = { ...existing[idx], ...(body.path ? { path: body.path } : {}), enabled: body.enabled !== false }
      const nextList = existing.slice()
      nextList[idx] = updated
      const nextSettings = setAccountsList(current, type, nextList)
      await setSettingsToBackend(nextSettings)
      settings = nextSettings
      workflow.configureStorage({
        watchPaths: nextSettings.channels.localFolders.paths,
        connections: nextSettings?.channels?.remoteStorage?.connections || [],
      })
      return res.json({ ok: true, account: updated })
    }

    const idx = existing.findIndex((a) => a && a.id === id)
    if (idx < 0) {
      return res.status(404).json({ error: 'account_not_found', id })
    }

    const updated = { ...existing[idx], ...body, id, updatedAt: new Date().toISOString() }
    const nextList = existing.slice()
    nextList[idx] = updated
    const nextSettings = setAccountsList(current, type, nextList)
    await setSettingsToBackend(nextSettings)
    settings = nextSettings

    if (type === 'storage') {
      workflow.configureStorage({
        watchPaths: nextSettings.channels?.localFolders?.paths || [],
        connections: nextSettings.channels?.remoteStorage?.connections || [],
      })
    } else if (type === 'ksef') {
      applyKsefFromSettings(nextSettings)
    } else if (type === 'email') {
      applyEmailFromSettings(nextSettings)
    } else if (type === 'scanners' || type === 'printers') {
      applyDevicesFromSettings(nextSettings)
    }

    res.json({ ok: true, account: updated })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.delete('/accounts/:type/:id', async (req, res) => {
  try {
    const type = req.params.type
    const id = req.params.id
    if (!ACCOUNT_TYPES.includes(type)) {
      return res.status(400).json({ error: `invalid_account_type: ${type}`, valid: ACCOUNT_TYPES })
    }

    const current = await getSettingsFromBackend()
    const existing = getAccountsList(current, type)

    if (type === 'local-folders') {
      const idx = existing.findIndex((a) => a.id === id || a.path === id)
      if (idx < 0) {
        return res.status(404).json({ error: 'folder_not_found' })
      }
      const nextList = existing.filter((_, i) => i !== idx)
      const nextSettings = setAccountsList(current, type, nextList)
      await setSettingsToBackend(nextSettings)
      settings = nextSettings
      workflow.configureStorage({
        watchPaths: nextSettings.channels.localFolders.paths,
        connections: nextSettings?.channels?.remoteStorage?.connections || [],
      })
      return res.json({ ok: true, deleted: id })
    }

    const idx = existing.findIndex((a) => a && a.id === id)
    if (idx < 0) {
      return res.status(404).json({ error: 'account_not_found', id })
    }

    const nextList = existing.filter((_, i) => i !== idx)
    const nextSettings = setAccountsList(current, type, nextList)

    // Clear active account if we deleted it
    if (type === 'ksef' && nextSettings.channels?.ksef?.activeAccountId === id) {
      nextSettings.channels.ksef.activeAccountId = nextList[0]?.id || null
    }
    if (type === 'email' && nextSettings.channels?.email?.activeAccountId === id) {
      nextSettings.channels.email.activeAccountId = nextList[0]?.id || null
    }

    await setSettingsToBackend(nextSettings)
    settings = nextSettings

    if (type === 'storage') {
      workflow.configureStorage({
        watchPaths: nextSettings.channels?.localFolders?.paths || [],
        connections: nextSettings.channels?.remoteStorage?.connections || [],
      })
    } else if (type === 'ksef') {
      applyKsefFromSettings(nextSettings)
    } else if (type === 'email') {
      applyEmailFromSettings(nextSettings)
    } else if (type === 'scanners' || type === 'printers') {
      applyDevicesFromSettings(nextSettings)
    }

    res.json({ ok: true, deleted: id })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

app.post('/accounts/:type/:id/sync', async (req, res) => {
  try {
    const type = req.params.type
    const id = req.params.id
    if (!ACCOUNT_TYPES.includes(type)) {
      return res.status(400).json({ error: `invalid_account_type: ${type}`, valid: ACCOUNT_TYPES })
    }

    const current = await getSettingsFromBackend()
    const existing = getAccountsList(current, type)

    if (type === 'local-folders') {
      const folder = existing.find((a) => a.id === id || a.path === id)
      if (!folder) {
        return res.status(404).json({ error: 'folder_not_found' })
      }
      const start = Date.now()
      const invoices = await workflow.storageSync.syncLocalFolder(folder.path)
      return res.json({ ok: true, count: Array.isArray(invoices) ? invoices.length : 0, ms: Date.now() - start })
    }

    if (type === 'storage') {
      const conn = existing.find((a) => a && a.id === id)
      if (!conn) {
        return res.status(404).json({ error: 'connection_not_found', id })
      }
      const start = Date.now()
      const invoices = await workflow.storageSync.syncConnection(conn)
      return res.json({ ok: true, count: Array.isArray(invoices) ? invoices.length : 0, ms: Date.now() - start })
    }

    if (type === 'email') {
      const acc = existing.find((a) => a && a.id === id)
      if (!acc) {
        return res.status(404).json({ error: 'account_not_found', id })
      }
      const start = Date.now()
      const invoices = await workflow.emailWatcher.pollAccount(acc)
      return res.json({ ok: true, count: Array.isArray(invoices) ? invoices.length : 0, ms: Date.now() - start })
    }

    if (type === 'ksef') {
      const acc = existing.find((a) => a && a.id === id)
      if (!acc) {
        return res.status(404).json({ error: 'account_not_found', id })
      }
      const token = acc.accessToken || null
      if (!token) {
        return res.status(400).json({ error: 'ksef_no_access_token' })
      }
      const start = Date.now()
      const since = req.body?.since || null
      const until = req.body?.until || null
      const invoices = await ksef.pollNewInvoices({ accessToken: token, since, until })
      let added = 0
      for (const invData of invoices) {
        const ksefKey = invData?.ksefReferenceNumber || invData?.ksefId || null
        if (!ksefKey) continue
        try {
          const downloaded = await ksef.downloadInvoice({ accessToken: token, ksefReferenceNumber: String(ksefKey), format: 'xml' })
          const xmlText = downloaded?.format === 'xml' ? downloaded.data : null
          if (!xmlText || !String(xmlText).trim()) continue
          await workflow.inbox.addInvoice('ksef', String(xmlText), {
            ...invData,
            sourceKey: `ksef:${String(ksefKey)}`,
            fileName: `ksef_${String(ksefKey)}.xml`,
            fileType: downloaded?.contentType || 'application/xml',
            fileSize: Buffer.byteLength(String(xmlText), 'utf8'),
          })
          added++
        } catch (_e) { continue }
      }
      return res.json({ ok: true, polled: invoices.length, added, ms: Date.now() - start })
    }

    if (type === 'scanners') {
      const scanner = existing.find((a) => a && a.id === id)
      if (!scanner) {
        return res.status(404).json({ error: 'scanner_not_found', id })
      }
      const start = Date.now()
      const docs = await workflow.deviceSync.listScannerDocuments(id)
      let added = 0
      for (const doc of (Array.isArray(docs) ? docs : [])) {
        const docId = doc?.id ? String(doc.id) : null
        if (!docId) continue
        const sk = `scanner:${id}:${docId}`
        const existing = await workflow.inbox.getInvoiceBySourceKey(sk)
        if (existing) continue
        try {
          const downloaded = await workflow.deviceSync.downloadScannerDocument(id, docId)
          if (downloaded?.content) {
            await workflow.inbox.addInvoice('scanner', downloaded.content, {
              sourceKey: sk,
              fileName: downloaded.fileName || `scan_${docId}.pdf`,
              fileType: downloaded.contentType || 'application/pdf',
              fileSize: downloaded.content?.length || 0,
            })
            added++
          }
        } catch (_e) { continue }
      }
      return res.json({ ok: true, total: Array.isArray(docs) ? docs.length : 0, added, ms: Date.now() - start })
    }

    res.status(400).json({ error: `sync_not_supported_for_type: ${type}` })
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'unknown_error' })
  }
})

function writePortFile(filePath, portNumber) {
  if (!filePath) {
    return
  }
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, String(portNumber), { encoding: 'utf8' })
  } catch (_e) {
  }
}

const host = process.env.EXEF_LOCAL_SERVICE_HOST ?? process.env.LOCAL_SERVICE_HOST ?? '127.0.0.1'
const preferredPort = Number(process.env.EXEF_LOCAL_SERVICE_PORT ?? process.env.LOCAL_SERVICE_PORT ?? 3030)
const maxTries = Number(process.env.EXEF_LOCAL_SERVICE_PORT_MAX_TRIES ?? 50)
const portFile = process.env.EXEF_LOCAL_SERVICE_PORT_FILE ?? './.exef-local-service.port'

listenWithFallback(app, {
  host,
  port: Number.isNaN(preferredPort) ? 0 : preferredPort,
  maxTries: Number.isNaN(maxTries) ? 50 : maxTries,
  allowRandom: true,
}).then(({ port }) => {
  writePortFile(portFile, port)
  process.stdout.write(`exef-local-service listening on http://${host}:${port}\n`)
  workflow.start().catch((err) => {
    process.stderr.write(`${err?.stack ?? err}\n`)
  })
}).catch((err) => {
  process.stderr.write(`${err?.stack ?? err}\n`)
  process.exit(1)
})
