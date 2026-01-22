const fs = require('node:fs')
const path = require('node:path')

let initPromise = null

async function loadSqlJs() {
  if (!initPromise) {
    const initSqlJs = require('sql.js')

    const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
    const wasmDir = path.dirname(wasmPath)

    initPromise = initSqlJs({
      locateFile: (file) => path.join(wasmDir, file),
    })
  }
  return initPromise
}

class SqliteDb {
  constructor(options = {}) {
    this.filePath = options.filePath
    this.SQL = null
    this.db = null
    this._initPromise = null
    this._persistPromise = Promise.resolve()
  }

  async _init() {
    if (this.db) {
      return this.db
    }

    if (!this._initPromise) {
      this._initPromise = (async () => {
        this.SQL = await loadSqlJs()

        let buffer = null
        if (this.filePath && fs.existsSync(this.filePath)) {
          buffer = fs.readFileSync(this.filePath)
        }

        this.db = buffer ? new this.SQL.Database(new Uint8Array(buffer)) : new this.SQL.Database()
        return this.db
      })()
    }

    return this._initPromise
  }

  async exec(sql) {
    const db = await this._init()
    db.exec(sql)
  }

  async all(sql, params = []) {
    const db = await this._init()
    const stmt = db.prepare(sql)
    try {
      stmt.bind(params)
      const rows = []
      while (stmt.step()) {
        rows.push(stmt.getAsObject())
      }
      return rows
    } finally {
      stmt.free()
    }
  }

  async get(sql, params = []) {
    const rows = await this.all(sql, params)
    return rows[0] || null
  }

  async run(sql, params = []) {
    const db = await this._init()
    const stmt = db.prepare(sql)
    try {
      stmt.run(params)
    } finally {
      stmt.free()
    }
  }

  async transaction(fn) {
    const db = await this._init()
    db.exec('BEGIN')
    try {
      const result = await fn()
      db.exec('COMMIT')
      return result
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }

  async persist() {
    if (!this.filePath) {
      return
    }

    const db = await this._init()
    const bytes = db.export()
    const fileBuffer = Buffer.from(bytes)
    const dir = path.dirname(this.filePath)

    this._persistPromise = this._persistPromise.then(async () => {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(this.filePath, fileBuffer)
    })

    return this._persistPromise
  }

  async exportFileBuffer() {
    const db = await this._init()
    const bytes = db.export()
    return Buffer.from(bytes)
  }

  async importFileBuffer(buffer) {
    this.SQL = await loadSqlJs()
    this.db = new this.SQL.Database(new Uint8Array(buffer))
    await this.persist()
  }
}

function createSqliteDb(options = {}) {
  return new SqliteDb(options)
}

module.exports = {
  SqliteDb,
  createSqliteDb,
}
