const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const dotenv = require('dotenv')
dotenv.config(process.env.EXEF_ENV_FILE ? { path: process.env.EXEF_ENV_FILE } : {})
const fs = require('node:fs')
const path = require('node:path')

const { createKsefFacade } = require('../core/ksefFacade')
const { listenWithFallback } = require('../core/listen')
const { createInvoiceWorkflow, INVOICE_STATUS } = require('../core/invoiceWorkflow')
const { createStore } = require('../core/draftStore')
const { EXPORT_FORMATS } = require('../core/exportService')
const { createSqliteDataLayer } = require('../core/sqliteDataLayer')

const app = express()
app.use(helmet({ 
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "http://127.0.0.1:*", "http://localhost:*", "ws://127.0.0.1:*", "ws://localhost:*"],
      imgSrc: ["'self'", "data:", "http:", "https:"],
      fontSrc: ["'self'", "data:", "http:", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
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
      "img-src 'self' data: http: https:; " +
      "font-src 'self' data: http: https:; " +
      "object-src 'none'; " +
      "media-src 'self'; " +
      "frame-src 'none'"
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


// Serve desktop renderer with CSP override
app.use('/', (req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    const filePath = path.join(__dirname, '../desktop/renderer', req.path === '/' ? 'index.html' : req.path);
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      // Remove CSP meta tag and let server handle it
      content = content.replace(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');
      res.setHeader('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:*; " +
        "img-src 'self' data: http: https:; " +
        "font-src 'self' data: http: https:; " +
        "object-src 'none'; " +
        "media-src 'self'; " +
        "frame-src 'none'"
      );
      res.send(content);
      return;
    }
  }
  next();
}, express.static(path.join(__dirname, '../desktop/renderer')))

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
    return 'unassigned'
  }
  const cleaned = trimmed
    .replace(/\.+/g, '.')
    .replace(/[\\/]/g, '_')
    .replace(/[<>:"|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || 'unassigned'
}

function inferFileExtension(fileType) {
  const ft = String(fileType || '').toLowerCase()
  if (ft.includes('pdf')) return '.pdf'
  if (ft.includes('png')) return '.png'
  if (ft.includes('jpeg') || ft.includes('jpg')) return '.jpg'
  if (ft.includes('xml')) return '.xml'
  return ''
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

    const filter = status === 'all' ? {} : { status }
    const invoices = await workflow.listInvoices(filter)

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

    for (const inv of invoices) {
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

    res.json({ ok: true, outputDir, status, exported, skippedNoFile, total: invoices.length })
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

app.post('/inbox/export', async (req, res) => {
  try {
    const format = req.body.format || EXPORT_FORMATS.CSV
    const result = await workflow.exportApproved(format, req.body.options || {})
    res.json(result)
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
    const { accessToken, since } = req.body
    const invoices = await ksef.pollNewInvoices({ accessToken, since })
    for (const invData of invoices) {
      const ksefKey = invData?.ksefReferenceNumber || invData?.ksefId || null
      await workflow.addManualInvoice('ksef', null, {
        ...invData,
        sourceKey: ksefKey ? `ksef:${String(ksefKey)}` : null,
      })
    }
    res.json({ added: invoices.length, invoices })
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
