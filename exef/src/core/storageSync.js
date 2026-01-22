const EventEmitter = require('node:events')
const fs = require('node:fs')
const path = require('node:path')

const STORAGE_PROVIDERS = {
  LOCAL: 'local-folder',
  DROPBOX: 'dropbox',
  GDRIVE: 'gdrive',
}

const INVOICE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.xml']

class StorageSync extends EventEmitter {
  constructor(options = {}) {
    super()
    this.provider = options.provider || STORAGE_PROVIDERS.LOCAL
    this.watchPaths = options.watchPaths || []
    this.processedFiles = new Set()
    this.inbox = options.inbox || null
    this.pollInterval = options.pollInterval || 60000
    this.isRunning = false
    this.pollTimer = null
    this.oauthConfig = options.oauthConfig || null
  }

  async start() {
    if (this.isRunning) {
      return
    }
    this.isRunning = true
    this.emit('started')
    await this._poll()
    this.pollTimer = setInterval(() => this._poll(), this.pollInterval)
  }

  stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    this.isRunning = false
    this.emit('stopped')
  }

  async _poll() {
    try {
      this.emit('polling')
      const files = await this.syncNewFiles()
      this.emit('poll:complete', { count: files.length })
    } catch (err) {
      this.emit('error', err)
    }
  }

  async syncNewFiles() {
    if (this.provider === STORAGE_PROVIDERS.LOCAL) {
      return this._syncLocalFolder()
    } else if (this.provider === STORAGE_PROVIDERS.DROPBOX) {
      return this._syncDropbox()
    } else if (this.provider === STORAGE_PROVIDERS.GDRIVE) {
      return this._syncGdrive()
    }
    return []
  }

  async _syncLocalFolder() {
    const invoices = []

    for (const watchPath of this.watchPaths) {
      if (!fs.existsSync(watchPath)) {
        continue
      }

      const files = fs.readdirSync(watchPath)

      for (const file of files) {
        const ext = path.extname(file).toLowerCase()
        if (!INVOICE_EXTENSIONS.includes(ext)) {
          continue
        }

        const fullPath = path.join(watchPath, file)
        const stat = fs.statSync(fullPath)

        if (!stat.isFile()) {
          continue
        }

        const fileKey = `${fullPath}:${stat.mtimeMs}`
        if (this.processedFiles.has(fileKey)) {
          continue
        }

        const content = fs.readFileSync(fullPath)

        if (this.inbox) {
          const invoice = await this.inbox.addInvoice('storage', content, {
            fileName: file,
            fileType: this._getMimeType(ext),
            fileSize: stat.size,
            sourcePath: fullPath,
          })
          invoices.push(invoice)
          this.emit('invoice:found', invoice)
        }

        this.processedFiles.add(fileKey)
      }
    }

    return invoices
  }

  async _syncDropbox() {
    if (!this.oauthConfig) {
      return []
    }

    // Placeholder - requires dropbox SDK
    // const { Dropbox } = require('dropbox')
    // Implementation would:
    // 1. List files in watchPaths
    // 2. Compare with cursor/processed list
    // 3. Download new files
    // 4. Add to inbox

    this.emit('dropbox:sync', { paths: this.watchPaths })
    return []
  }

  async _syncGdrive() {
    if (!this.oauthConfig) {
      return []
    }

    // Placeholder - requires googleapis
    // const { google } = require('googleapis')
    // Implementation would:
    // 1. List files in watchPaths folders
    // 2. Check modified time vs last sync
    // 3. Download new/modified files
    // 4. Add to inbox

    this.emit('gdrive:sync', { paths: this.watchPaths })
    return []
  }

  _getMimeType(ext) {
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.xml': 'application/xml',
    }
    return mimeTypes[ext] || 'application/octet-stream'
  }

  addWatchPath(pathToWatch) {
    if (!this.watchPaths.includes(pathToWatch)) {
      this.watchPaths.push(pathToWatch)
    }
  }

  setWatchPaths(paths) {
    if (!Array.isArray(paths)) {
      this.watchPaths = []
      return
    }
    const normalized = Array.from(
      new Set(
        paths
          .map((p) => String(p))
          .map((p) => p.trim())
          .filter(Boolean)
      )
    )
    this.watchPaths = normalized
  }

  removeWatchPath(pathToRemove) {
    this.watchPaths = this.watchPaths.filter((p) => p !== pathToRemove)
  }

  setOauthConfig(config) {
    this.oauthConfig = {
      accessToken: config.accessToken,
      refreshToken: config.refreshToken,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    }
  }

  clearProcessedCache() {
    this.processedFiles.clear()
  }
}

function createStorageSync(options = {}) {
  return new StorageSync(options)
}

module.exports = {
  StorageSync,
  createStorageSync,
  STORAGE_PROVIDERS,
  INVOICE_EXTENSIONS,
}
