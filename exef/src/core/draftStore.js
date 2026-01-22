const fs = require('node:fs')
const path = require('node:path')

class InMemoryStore {
  constructor() {
    this.data = new Map()
  }

  async save(invoice) {
    this.data.set(invoice.id, { ...invoice })
  }

  async get(id) {
    return this.data.get(id) || null
  }

  async list(filter = {}) {
    return Array.from(this.data.values())
  }

  async delete(id) {
    this.data.delete(id)
  }
}

class JsonFileStore {
  constructor(filePath) {
    this.filePath = filePath
    this.data = new Map()
    this._load()
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8')
        const arr = JSON.parse(raw)
        for (const inv of arr) {
          this.data.set(inv.id, inv)
        }
      }
    } catch (_e) {}
  }

  _persist() {
    const arr = Array.from(this.data.values())
    const dir = path.dirname(this.filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(this.filePath, JSON.stringify(arr, null, 2), 'utf8')
  }

  async save(invoice) {
    this.data.set(invoice.id, { ...invoice })
    this._persist()
  }

  async get(id) {
    return this.data.get(id) || null
  }

  async list(filter = {}) {
    return Array.from(this.data.values())
  }

  async delete(id) {
    this.data.delete(id)
    this._persist()
  }
}

function createStore(options = {}) {
  if (options.filePath) {
    return new JsonFileStore(options.filePath)
  }
  return new InMemoryStore()
}

module.exports = {
  InMemoryStore,
  JsonFileStore,
  createStore,
}
