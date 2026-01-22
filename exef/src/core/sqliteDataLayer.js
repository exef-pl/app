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
        '  created_at TEXT,',
        '  updated_at TEXT,',
        '  json TEXT NOT NULL',
        ');',
        'CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);',
        'CREATE INDEX IF NOT EXISTS idx_invoices_source ON invoices(source);',
        'CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at);',
      ].join('\n')
    )
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
    const createdAt = invoice?.createdAt ? String(invoice.createdAt) : nowIso()
    const updatedAt = invoice?.updatedAt ? String(invoice.updatedAt) : nowIso()

    const json = JSON.stringify({ ...invoice, id, createdAt, updatedAt })

    await this.db.run(
      [
        'INSERT INTO invoices(id, status, source, contractor_nip, issue_date, gross_amount, currency, created_at, updated_at, json)',
        'VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        'ON CONFLICT(id) DO UPDATE SET',
        '  status=excluded.status,',
        '  source=excluded.source,',
        '  contractor_nip=excluded.contractor_nip,',
        '  issue_date=excluded.issue_date,',
        '  gross_amount=excluded.gross_amount,',
        '  currency=excluded.currency,',
        '  created_at=excluded.created_at,',
        '  updated_at=excluded.updated_at,',
        '  json=excluded.json',
      ].join('\n'),
      [id, status, source, contractorNip, issueDate, grossAmount, currency, createdAt, updatedAt, json]
    )

    await this.db.persist()
  }

  async get(id) {
    const row = await this.db.get('SELECT json FROM invoices WHERE id = ? LIMIT 1', [String(id)])
    return row ? safeJsonParse(row.json, null) : null
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
    return rows.map((r) => safeJsonParse(r.json, null)).filter(Boolean)
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
