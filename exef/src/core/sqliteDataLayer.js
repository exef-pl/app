const { createSqliteDb } = require('./sqliteDb')

function nowIso() {
  return new Date().toISOString()
}

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw)
  } catch (_e) {
    return fallback
  }
}

function stripOriginalFileForJson(invoice) {
  if (!invoice || typeof invoice !== 'object') {
    return invoice
  }
  const copy = { ...invoice }
  delete copy.originalFile
  return copy
}

function normalizeFileToBuffer(value) {
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

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }
    const dataUrlMatch = trimmed.match(/^data:([^;]+);base64,(.*)$/i)
    if (dataUrlMatch) {
      return Buffer.from(dataUrlMatch[2], 'base64')
    }

    const base64Candidate = trimmed.replace(/\s/g, '')
    const looksBase64 =
      base64Candidate.length >= 64 &&
      base64Candidate.length % 4 === 0 &&
      /^[a-z0-9+/]+=*$/i.test(base64Candidate)

    if (looksBase64) {
      try {
        return Buffer.from(base64Candidate, 'base64')
      } catch (_e) {
        return Buffer.from(trimmed, 'utf8')
      }
    }

    return Buffer.from(trimmed, 'utf8')
  }

  return null
}

function normalizeDbBlob(value) {
  if (!value) {
    return null
  }
  if (Buffer.isBuffer(value)) {
    return value
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value)
  }
  if (Array.isArray(value) && value.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    return Buffer.from(value)
  }
  return null
}

class SqliteKeyValueRepo {
  constructor(db) {
    this.db = db
  }

  async init() {
    await this.db.exec(
      [
        'PRAGMA foreign_keys = ON;',
        'CREATE TABLE IF NOT EXISTS kv (',
        '  key TEXT PRIMARY KEY,',
        '  json TEXT NOT NULL,',
        '  updated_at TEXT',
        ');',
      ].join('\n')
    )
  }

  async get(key) {
    const row = await this.db.get('SELECT json FROM kv WHERE key = ? LIMIT 1', [key])
    return row ? row.json : null
  }

  async set(key, value) {
    await this.db.run(
      'INSERT INTO kv(key, json, updated_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at',
      [key, value, nowIso()]
    )
    await this.db.persist()
  }
}

class SqliteJsonRepo {
  constructor(db, tableName) {
    this.db = db
    this.tableName = tableName
  }

  async init() {
    await this.db.exec(
      [
        'CREATE TABLE IF NOT EXISTS ' + this.tableName + ' (',
        '  id TEXT PRIMARY KEY,',
        '  json TEXT NOT NULL,',
        '  updated_at TEXT',
        ');',
      ].join('\n')
    )
  }

  async list() {
    const rows = await this.db.all('SELECT json FROM ' + this.tableName + ' ORDER BY id ASC')
    return rows.map((r) => safeJsonParse(r.json, null)).filter(Boolean)
  }

  async get(id) {
    const row = await this.db.get('SELECT json FROM ' + this.tableName + ' WHERE id = ? LIMIT 1', [id])
    return row ? safeJsonParse(row.json, null) : null
  }

  async upsert(obj) {
    const id = obj && obj.id ? String(obj.id) : null
    if (!id) {
      throw new Error('id is required')
    }
    const json = JSON.stringify({ ...obj, id })

    await this.db.run(
      'INSERT INTO ' + this.tableName + '(id, json, updated_at) VALUES(?, ?, ?) ON CONFLICT(id) DO UPDATE SET json=excluded.json, updated_at=excluded.updated_at',
      [id, json, nowIso()]
    )
    await this.db.persist()
    return { ...obj, id }
  }

  async delete(id) {
    await this.db.run('DELETE FROM ' + this.tableName + ' WHERE id = ?', [String(id)])
    await this.db.persist()
  }

  async replaceAll(items) {
    await this.db.transaction(async () => {
      await this.db.run('DELETE FROM ' + this.tableName)
      for (const item of items || []) {
        await this.upsert(item)
      }
    })
    await this.db.persist()
  }
}

class SqliteContractorsRepo {
  constructor(db) {
    this.db = db
  }

  async init() {
    await this.db.exec(
      [
        'CREATE TABLE IF NOT EXISTS contractors (',
        '  nip TEXT PRIMARY KEY,',
        '  name TEXT,',
        '  json TEXT NOT NULL,',
        '  updated_at TEXT',
        ');',
      ].join('\n')
    )
  }

  async upsertFromInvoice(invoice) {
    const nip = invoice?.contractorNip ? String(invoice.contractorNip).trim() : ''
    if (!nip) {
      return
    }
    const name = invoice?.contractorName ? String(invoice.contractorName) : null
    const json = JSON.stringify({ nip, name })
    await this.db.run(
      'INSERT INTO contractors(nip, name, json, updated_at) VALUES(?, ?, ?, ?) ON CONFLICT(nip) DO UPDATE SET name=excluded.name, json=excluded.json, updated_at=excluded.updated_at',
      [nip, name, json, nowIso()]
    )
  }

  async list() {
    const rows = await this.db.all('SELECT json FROM contractors ORDER BY nip ASC')
    return rows.map((r) => safeJsonParse(r.json, null)).filter(Boolean)
  }

  async replaceAll(items) {
    await this.db.transaction(async () => {
      await this.db.run('DELETE FROM contractors')
      for (const it of items || []) {
        const nip = it?.nip ? String(it.nip) : null
        if (!nip) {
          continue
        }
        const name = it?.name ? String(it.name) : null
        const json = JSON.stringify({ nip, name })
        await this.db.run(
          'INSERT INTO contractors(nip, name, json, updated_at) VALUES(?, ?, ?, ?)',
          [nip, name, json, nowIso()]
        )
      }
    })
    await this.db.persist()
  }
}

class SqliteInvoiceStore {
  constructor(db, contractorsRepo) {
    this.db = db
    this.contractorsRepo = contractorsRepo
  }

  async init() {
    await this.db.exec(
      [
        'CREATE TABLE IF NOT EXISTS invoices (',
        '  id TEXT PRIMARY KEY,',
        '  status TEXT,',
        '  source TEXT,',
        '  contractor_nip TEXT,',
        '  issue_date TEXT,',
        '  gross_amount REAL,',
        '  currency TEXT,',
        '  file_name TEXT,',
        '  file_type TEXT,',
        '  file_size INTEGER,',
        '  file_blob BLOB,',
        '  created_at TEXT,',
        '  updated_at TEXT,',
        '  json TEXT NOT NULL',
        ');',
        'CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);',
        'CREATE INDEX IF NOT EXISTS idx_invoices_source ON invoices(source);',
        'CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at);',
      ].join('\n')
    )

    const columns = await this.db.all('PRAGMA table_info(invoices)')
    const names = new Set(columns.map((c) => String(c.name)))
    const alter = async (sql) => {
      await this.db.exec(sql)
    }
    if (!names.has('file_name')) {
      await alter('ALTER TABLE invoices ADD COLUMN file_name TEXT')
    }
    if (!names.has('file_type')) {
      await alter('ALTER TABLE invoices ADD COLUMN file_type TEXT')
    }
    if (!names.has('file_size')) {
      await alter('ALTER TABLE invoices ADD COLUMN file_size INTEGER')
    }
    if (!names.has('file_blob')) {
      await alter('ALTER TABLE invoices ADD COLUMN file_blob BLOB')
    }

    await this._migrateFilesToBlobs()
  }

  async _migrateFilesToBlobs() {
    const cols = await this.db.all('PRAGMA table_info(invoices)')
    const names = new Set(cols.map((c) => String(c.name)))
    if (!names.has('file_blob')) {
      return
    }

    const rows = await this.db.all(
      'SELECT id, json, file_blob, file_name, file_type, file_size FROM invoices WHERE file_blob IS NULL'
    )

    for (const row of rows) {
      const inv = row?.json ? safeJsonParse(row.json, null) : null
      if (!inv || typeof inv !== 'object') {
        continue
      }
      if (!inv.originalFile) {
        continue
      }

      const fileBuf = normalizeFileToBuffer(inv.originalFile)
      if (!fileBuf) {
        continue
      }

      const fileName = inv.fileName ? String(inv.fileName) : null
      const fileType = inv.fileType ? String(inv.fileType) : null
      const fileSize = inv.fileSize != null ? Number(inv.fileSize) : fileBuf.length
      const json = JSON.stringify(stripOriginalFileForJson({ ...inv, id: String(inv.id || row.id) }))

      await this.db.run(
        'UPDATE invoices SET file_name = ?, file_type = ?, file_size = ?, file_blob = ?, json = ? WHERE id = ?',
        [fileName, fileType, fileSize, fileBuf, json, String(row.id)]
      )
    }

    await this.db.persist()
  }

  async save(invoice) {
    const id = invoice && invoice.id ? String(invoice.id) : null
    if (!id) {
      throw new Error('invoice.id is required')
    }

    await this.contractorsRepo.upsertFromInvoice(invoice)

    const status = invoice?.status ? String(invoice.status) : null
    const source = invoice?.source ? String(invoice.source) : null
    const contractorNip = invoice?.contractorNip ? String(invoice.contractorNip) : null
    const issueDate = invoice?.issueDate ? String(invoice.issueDate) : null
    const grossAmount = invoice?.grossAmount != null ? Number(invoice.grossAmount) : null
    const currency = invoice?.currency ? String(invoice.currency) : null
    const fileName = invoice?.fileName ? String(invoice.fileName) : null
    const fileType = invoice?.fileType ? String(invoice.fileType) : null

    const fileBuf = normalizeFileToBuffer(invoice?.originalFile)
    const fileSize = invoice?.fileSize != null
      ? Number(invoice.fileSize)
      : (fileBuf ? fileBuf.length : null)
    const createdAt = invoice?.createdAt ? String(invoice.createdAt) : nowIso()
    const updatedAt = invoice?.updatedAt ? String(invoice.updatedAt) : nowIso()

    const json = JSON.stringify(stripOriginalFileForJson({ ...invoice, id, createdAt, updatedAt }))

    await this.db.run(
      [
        'INSERT INTO invoices(id, status, source, contractor_nip, issue_date, gross_amount, currency, file_name, file_type, file_size, file_blob, created_at, updated_at, json)',
        'VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        'ON CONFLICT(id) DO UPDATE SET',
        '  status=excluded.status,',
        '  source=excluded.source,',
        '  contractor_nip=excluded.contractor_nip,',
        '  issue_date=excluded.issue_date,',
        '  gross_amount=excluded.gross_amount,',
        '  currency=excluded.currency,',
        '  file_name=excluded.file_name,',
        '  file_type=excluded.file_type,',
        '  file_size=excluded.file_size,',
        '  file_blob=excluded.file_blob,',
        '  created_at=excluded.created_at,',
        '  updated_at=excluded.updated_at,',
        '  json=excluded.json',
      ].join('\n'),
      [
        id,
        status,
        source,
        contractorNip,
        issueDate,
        grossAmount,
        currency,
        fileName,
        fileType,
        fileSize,
        fileBuf,
        createdAt,
        updatedAt,
        json,
      ]
    )

    await this.db.persist()
  }

  async get(id) {
    const row = await this.db.get('SELECT json, file_blob, file_name, file_type, file_size FROM invoices WHERE id = ? LIMIT 1', [String(id)])
    const invoice = row ? safeJsonParse(row.json, null) : null
    if (!invoice) {
      return null
    }
    const fileBuf = normalizeDbBlob(row.file_blob)
    return {
      ...invoice,
      originalFile: fileBuf,
      fileName: invoice.fileName ?? row.file_name ?? null,
      fileType: invoice.fileType ?? row.file_type ?? null,
      fileSize: invoice.fileSize ?? row.file_size ?? (fileBuf ? fileBuf.length : null),
    }
  }

  async list(_filter = {}) {
    const where = []
    const params = []

    if (_filter.status) {
      where.push('status = ?')
      params.push(String(_filter.status))
    }
    if (_filter.source) {
      where.push('source = ?')
      params.push(String(_filter.source))
    }
    if (_filter.since) {
      where.push('created_at >= ?')
      params.push(String(_filter.since))
    }

    const sql =
      'SELECT json FROM invoices' +
      (where.length ? ' WHERE ' + where.join(' AND ') : '') +
      ' ORDER BY created_at DESC'

    const rows = await this.db.all(sql, params)
    return rows
      .map((r) => safeJsonParse(r.json, null))
      .filter(Boolean)
      .map((inv) => stripOriginalFileForJson(inv))
  }

  async getFile(id) {
    const row = await this.db.get('SELECT file_blob, file_name, file_type, file_size FROM invoices WHERE id = ? LIMIT 1', [String(id)])
    if (!row) {
      return null
    }
    const fileBuf = normalizeDbBlob(row.file_blob)
    return {
      file: fileBuf,
      fileName: row.file_name || null,
      fileType: row.file_type || null,
      fileSize: row.file_size != null ? Number(row.file_size) : (fileBuf ? fileBuf.length : null),
    }
  }

  async delete(id) {
    await this.db.run('DELETE FROM invoices WHERE id = ?', [String(id)])
    await this.db.persist()
  }

  async replaceAll(items) {
    await this.db.transaction(async () => {
      await this.db.run('DELETE FROM invoices')
      for (const inv of items || []) {
        await this.save(inv)
      }
    })
    await this.db.persist()
  }
}

async function initDataLayer(layer) {
  await layer.kv.init()
  await layer.projects.init()
  await layer.labels.init()
  await layer.expenseTypes.init()
  await layer.contractors.init()
  await layer.invoices.init()
}

function createSqliteDataLayer(options = {}) {
  const dbPath = options.dbPath
  const db = createSqliteDb({ filePath: dbPath })

  const kv = new SqliteKeyValueRepo(db)
  const projects = new SqliteJsonRepo(db, 'projects')
  const labels = new SqliteJsonRepo(db, 'labels')
  const expenseTypes = new SqliteJsonRepo(db, 'expense_types')
  const contractors = new SqliteContractorsRepo(db)
  const invoices = new SqliteInvoiceStore(db, contractors)

  const layer = {
    db,
    kv,
    projects,
    labels,
    expenseTypes,
    contractors,
    invoices,
    init: () => initDataLayer(layer),
  }

  layer.getSettings = async (defaults) => {
    await layer.init()
    const raw = await kv.get('settings')
    const parsed = raw ? safeJsonParse(raw, null) : null
    return parsed && typeof parsed === 'object' ? { ...defaults, ...parsed } : defaults
  }

  layer.setSettings = async (settings) => {
    await layer.init()
    await kv.set('settings', JSON.stringify(settings))
    return settings
  }

  layer.exportBundle = async () => {
    await layer.init()
    const settingsRaw = await kv.get('settings')
    const settings = settingsRaw ? safeJsonParse(settingsRaw, null) : null

    return {
      version: 1,
      exportedAt: nowIso(),
      settings,
      projects: await projects.list(),
      labels: await labels.list(),
      expenseTypes: await expenseTypes.list(),
      contractors: await contractors.list(),
      invoices: await invoices.list({}),
    }
  }

  layer.importBundle = async (bundle) => {
    await layer.init()

    const data = bundle && typeof bundle === 'object' ? bundle : {}

    await layer.db.transaction(async () => {
      if (data.settings && typeof data.settings === 'object') {
        await kv.set('settings', JSON.stringify(data.settings))
      }

      if (Array.isArray(data.projects)) {
        await projects.replaceAll(data.projects)
      }
      if (Array.isArray(data.labels)) {
        await labels.replaceAll(data.labels)
      }
      if (Array.isArray(data.expenseTypes)) {
        await expenseTypes.replaceAll(data.expenseTypes)
      }
      if (Array.isArray(data.contractors)) {
        await contractors.replaceAll(data.contractors)
      }
      if (Array.isArray(data.invoices)) {
        await layer.db.run('DELETE FROM invoices')
        for (const inv of data.invoices) {
          await invoices.save(inv)
        }
      }
    })

    await layer.db.persist()
  }

  return layer
}

module.exports = {
  createSqliteDataLayer,
}
