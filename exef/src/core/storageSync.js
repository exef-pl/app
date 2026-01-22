const EventEmitter = require('node:events')
const fs = require('node:fs')
const path = require('node:path')

const STORAGE_PROVIDERS = {
  LOCAL: 'local-folder',
  DROPBOX: 'dropbox',
  GDRIVE: 'gdrive',
  ONEDRIVE: 'onedrive',
  NEXTCLOUD: 'nextcloud',
}

const INVOICE_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.xml']

class StorageSync extends EventEmitter {
  constructor(options = {}) {
    super()
    this.provider = options.provider || STORAGE_PROVIDERS.LOCAL
    this.watchPaths = options.watchPaths || []
    this.connections = Array.isArray(options.connections) ? options.connections : []
    this.processedFiles = new Set()
    this.inbox = options.inbox || null
    this.pollInterval = options.pollInterval || 60000
    this.isRunning = false
    this.pollTimer = null
    this.oauthConfig = options.oauthConfig || null
    this._dropboxCursors = new Map()
    this._gdriveSince = new Map()
    this._onedriveDeltaLinks = new Map()

    if (options.state) {
      this.setState(options.state)
    }
  }

  getState() {
    return {
      dropboxCursors: Object.fromEntries(this._dropboxCursors.entries()),
      gdriveSince: Object.fromEntries(this._gdriveSince.entries()),
      onedriveDeltaLinks: Object.fromEntries(this._onedriveDeltaLinks.entries()),
    }
  }

  setState(state) {
    const dropboxCursors = state?.dropboxCursors && typeof state.dropboxCursors === 'object'
      ? state.dropboxCursors
      : {}
    const gdriveSince = state?.gdriveSince && typeof state.gdriveSince === 'object'
      ? state.gdriveSince
      : {}
    const onedriveDeltaLinks = state?.onedriveDeltaLinks && typeof state.onedriveDeltaLinks === 'object'
      ? state.onedriveDeltaLinks
      : {}

    this._dropboxCursors = new Map(Object.entries(dropboxCursors).map(([k, v]) => [String(k), v]))
    this._gdriveSince = new Map(Object.entries(gdriveSince).map(([k, v]) => [String(k), v]))
    this._onedriveDeltaLinks = new Map(Object.entries(onedriveDeltaLinks).map(([k, v]) => [String(k), v]))
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
    if (this.connections && this.connections.length) {
      const invoices = []
      const conns = this._getSortedConnections(this.connections)

      for (const conn of conns) {
        const chunk = await this._syncConnection(conn)
        for (const inv of chunk) {
          invoices.push(inv)
        }
      }

      const local = await this._syncLocalFolder()
      for (const inv of local) {
        invoices.push(inv)
      }

      return invoices
    }

    if (this.provider === STORAGE_PROVIDERS.LOCAL) {
      return this._syncLocalFolder()
    } else if (this.provider === STORAGE_PROVIDERS.DROPBOX) {
      return this._syncDropbox()
    } else if (this.provider === STORAGE_PROVIDERS.GDRIVE) {
      return this._syncGdrive()
    }
    return []
  }

  _getSortedConnections(connections) {
    const items = Array.isArray(connections) ? connections : []
    const enabled = items.filter((c) => c && (c.enabled !== false))
    const defaultPriority = (type) => {
      if (type === STORAGE_PROVIDERS.DROPBOX) return 10
      if (type === STORAGE_PROVIDERS.GDRIVE) return 20
      if (type === STORAGE_PROVIDERS.ONEDRIVE) return 25
      if (type === STORAGE_PROVIDERS.NEXTCLOUD) return 30
      if (type === STORAGE_PROVIDERS.LOCAL) return 40
      return 100
    }

    return enabled
      .map((c) => ({
        ...c,
        type: String(c.type || '').trim().toLowerCase(),
      }))
      .sort((a, b) => {
        const ap = a.priority != null ? Number(a.priority) : defaultPriority(a.type)
        const bp = b.priority != null ? Number(b.priority) : defaultPriority(b.type)
        if (ap !== bp) return ap - bp
        return String(a.id || '').localeCompare(String(b.id || ''))
      })
  }

  async _syncConnection(conn) {
    const type = String(conn?.type || '').trim().toLowerCase()
    if (type === STORAGE_PROVIDERS.DROPBOX) {
      return this._syncDropboxConnection(conn)
    }
    if (type === STORAGE_PROVIDERS.GDRIVE) {
      return this._syncGdriveConnection(conn)
    }
    if (type === STORAGE_PROVIDERS.ONEDRIVE) {
      return this._syncOnedriveConnection(conn)
    }
    if (type === STORAGE_PROVIDERS.NEXTCLOUD) {
      return this._syncNextcloudConnection(conn)
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

        const sourceKey = `local:${fileKey}`
        if (this.inbox && typeof this.inbox.getInvoiceBySourceKey === 'function') {
          const existing = await this.inbox.getInvoiceBySourceKey(sourceKey)
          if (existing) {
            this.processedFiles.add(fileKey)
            continue
          }
        }

        const content = fs.readFileSync(fullPath)

        if (this.inbox) {
          const invoice = await this.inbox.addInvoice('storage', content, {
            fileName: file,
            fileType: this._getMimeType(ext),
            fileSize: stat.size,
            sourceKey,
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

  async _syncDropboxConnection(conn) {
    const accessToken = conn?.accessToken || conn?.oauth?.accessToken || conn?.oauthConfig?.accessToken
    if (!accessToken) {
      return []
    }

    const watchPaths = Array.isArray(conn?.paths) ? conn.paths : Array.isArray(conn?.watchPaths) ? conn.watchPaths : []
    const paths = watchPaths.length ? watchPaths : ['/']
    const invoices = []

    for (const p of paths) {
      const cursorKey = `dropbox:${conn?.id || 'dropbox'}:${String(p || '')}`
      let cursor = this._dropboxCursors.get(cursorKey) || null
      let hasMore = true
      let first = cursor ? false : true

      const apiBase = conn?.apiUrl || 'https://api.dropboxapi.com'

      while (hasMore) {
        const url = first
          ? `${apiBase}/2/files/list_folder`
          : `${apiBase}/2/files/list_folder/continue`
        const body = first
          ? {
            path: String(p || ''),
            recursive: true,
            include_deleted: false,
          }
          : { cursor }

        first = false

        const listRes = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })

        if (!listRes.ok) {
          const errText = await listRes.text().catch(() => '')
          this.emit('error', new Error(`Dropbox list_folder failed: ${listRes.status}${errText ? ` ${errText}` : ''}`))
          break
        }

        const data = await listRes.json().catch(() => ({}))
        cursor = data.cursor || cursor
        hasMore = Boolean(data.has_more)
        const entries = Array.isArray(data.entries) ? data.entries : []

        for (const entry of entries) {
          if (!entry || entry['.tag'] !== 'file') continue
          const name = String(entry.name || '')
          if (!this._isInvoiceFileName(name)) continue

          const key = `dropbox:${conn?.id || 'dropbox'}:${entry.id || entry.path_display || name}:${entry.server_modified || ''}`
          if (this.processedFiles.has(key)) continue

          if (this.inbox && typeof this.inbox.getInvoiceBySourceKey === 'function') {
            const existing = await this.inbox.getInvoiceBySourceKey(key)
            if (existing) {
              this.processedFiles.add(key)
              continue
            }
          }

          const content = await this._downloadDropboxFile(accessToken, entry.path_display, conn)
          const ext = path.extname(name).toLowerCase()

          if (this.inbox) {
            const invoice = await this.inbox.addInvoice('storage', content, {
              fileName: name,
              fileType: this._getMimeType(ext),
              fileSize: entry.size != null ? Number(entry.size) : null,
              sourceKey: key,
              storageType: STORAGE_PROVIDERS.DROPBOX,
              storageProviderId: conn?.id || null,
              sourcePath: entry.path_display || null,
              storageId: entry.id || null,
            })
            invoices.push(invoice)
            this.emit('invoice:found', invoice)
          }

          this.processedFiles.add(key)
        }

        if (hasMore && !cursor) {
          break
        }
      }

      if (cursor) {
        this._dropboxCursors.set(cursorKey, cursor)
        this.emit('state:changed', this.getState())
      }
    }

    this.emit('dropbox:sync', { connectionId: conn?.id || null, paths })
    return invoices
  }

  async _downloadDropboxFile(accessToken, dropboxPath, conn) {
    const apiBase = conn?.apiUrl || 'https://content.dropboxapi.com'
    const res = await fetch(`${apiBase}/2/files/download`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({ path: String(dropboxPath || '') }),
      },
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`Dropbox download failed: ${res.status}${errText ? ` ${errText}` : ''}`)
    }
    const arr = await res.arrayBuffer()
    return Buffer.from(arr)
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

  async _syncGdriveConnection(conn) {
    let accessToken = this._getGdriveAccessToken(conn)
    if (!accessToken) {
      accessToken = await this._refreshGdriveAccessToken(conn)
      if (!accessToken) {
        return []
      }
    }

    const folderIdsRaw = Array.isArray(conn?.folderIds)
      ? conn.folderIds
      : conn?.folderId
        ? [conn.folderId]
        : []

    const folderIds = Array.from(new Set(folderIdsRaw.map((v) => String(v)).map((v) => v.trim()).filter(Boolean)))
    if (!folderIds.length) {
      return []
    }

    const invoices = []

    for (const folderId of folderIds) {
      const sinceKey = `gdrive:${conn?.id || 'gdrive'}:${String(folderId)}`
      const since = this._gdriveSince.get(sinceKey) || null
      let pageToken = null
      let maxModifiedTime = null

      const apiBase = conn?.apiUrl || 'https://www.googleapis.com'

      do {
        const qBase = `'${folderId.replace(/'/g, "\\'")}' in parents and trashed=false`
        const q = since
          ? `${qBase} and modifiedTime > '${String(since).replace(/'/g, "\\'")}'`
          : qBase
        const base =
          `${apiBase}/drive/v3/files` +
          `?q=${encodeURIComponent(q)}` +
          `&pageSize=${encodeURIComponent('1000')}` +
          `&fields=${encodeURIComponent('nextPageToken,files(id,name,mimeType,size,modifiedTime)')}`
        const url = pageToken
          ? `${base}&pageToken=${encodeURIComponent(pageToken)}`
          : base

        let listRes = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })

        if (listRes.status === 401) {
          const refreshed = await this._refreshGdriveAccessToken(conn)
          if (refreshed) {
            accessToken = refreshed
            listRes = await fetch(url, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            })
          }
        }

        if (!listRes.ok) {
          const errText = await listRes.text().catch(() => '')
          this.emit('error', new Error(`Google Drive list failed: ${listRes.status}${errText ? ` ${errText}` : ''}`))
          break
        }

        const data = await listRes.json().catch(() => ({}))
        const files = Array.isArray(data.files) ? data.files : []

        for (const f of files) {
          const name = String(f?.name || '')
          if (!this._isInvoiceFileName(name)) continue

          const key = `gdrive:${conn?.id || 'gdrive'}:${f.id || name}:${f.modifiedTime || ''}`
          if (this.processedFiles.has(key)) continue

          if (this.inbox && typeof this.inbox.getInvoiceBySourceKey === 'function') {
            const existing = await this.inbox.getInvoiceBySourceKey(key)
            if (existing) {
              this.processedFiles.add(key)
              continue
            }
          }

          const content = await this._downloadGdriveFile({ accessToken, conn, fileId: f.id })
          const ext = path.extname(name).toLowerCase()

          if (this.inbox) {
            const invoice = await this.inbox.addInvoice('storage', content, {
              fileName: name,
              fileType: f.mimeType || this._getMimeType(ext),
              fileSize: f.size != null ? Number(f.size) : null,
              sourceKey: key,
              storageType: STORAGE_PROVIDERS.GDRIVE,
              storageProviderId: conn?.id || null,
              storageId: f.id || null,
              sourcePath: f.id || null,
            })
            invoices.push(invoice)
            this.emit('invoice:found', invoice)
          }

          this.processedFiles.add(key)

          if (f.modifiedTime && (!maxModifiedTime || String(f.modifiedTime) > String(maxModifiedTime))) {
            maxModifiedTime = String(f.modifiedTime)
          }
        }

        pageToken = data.nextPageToken || null
      } while (pageToken)

      if (maxModifiedTime) {
        const parsed = Date.parse(maxModifiedTime)
        if (!Number.isNaN(parsed)) {
          this._gdriveSince.set(sinceKey, new Date(parsed - 1).toISOString())
        } else {
          this._gdriveSince.set(sinceKey, maxModifiedTime)
        }
        this.emit('state:changed', this.getState())
      }
    }

    this.emit('gdrive:sync', { connectionId: conn?.id || null, folderIds })
    return invoices
  }

  _getGdriveAccessToken(conn) {
    const token = conn?.accessToken || conn?.oauth?.accessToken || conn?.oauthConfig?.accessToken
    return token ? String(token) : null
  }

  _getGdriveRefreshToken(conn) {
    const token = conn?.refreshToken || conn?.oauth?.refreshToken || conn?.oauthConfig?.refreshToken
    return token ? String(token) : null
  }

  _getGdriveClientId(conn) {
    const id = conn?.clientId || conn?.oauth?.clientId || conn?.oauthConfig?.clientId || this.oauthConfig?.clientId
    return id ? String(id) : null
  }

  _getGdriveClientSecret(conn) {
    const secret = conn?.clientSecret || conn?.oauth?.clientSecret || conn?.oauthConfig?.clientSecret || this.oauthConfig?.clientSecret
    return secret ? String(secret) : null
  }

  _applyGdriveAccessToken(conn, accessToken, expiresInSeconds) {
    const token = accessToken ? String(accessToken) : null
    if (!token) {
      return
    }

    const expiresAt =
      expiresInSeconds != null && !Number.isNaN(Number(expiresInSeconds))
        ? new Date(Date.now() + Number(expiresInSeconds) * 1000 - 10000).toISOString()
        : null

    conn.accessToken = token
    conn.oauth = {
      ...(conn.oauth || {}),
      accessToken: token,
      ...(expiresAt ? { expiresAt } : {}),
    }
    conn.oauthConfig = {
      ...(conn.oauthConfig || {}),
      accessToken: token,
      ...(expiresAt ? { expiresAt } : {}),
    }

    if (conn?.id) {
      const idx = this.connections.findIndex((c) => c && c.id === conn.id)
      if (idx >= 0) {
        this.connections[idx] = { ...this.connections[idx], ...conn }
      }
      this.emit('connection:updated', { connection: { ...conn } })
    }
  }

  async _refreshGdriveAccessToken(conn) {
    const refreshToken = this._getGdriveRefreshToken(conn)
    const clientId = this._getGdriveClientId(conn)
    const clientSecret = this._getGdriveClientSecret(conn)

    if (!refreshToken || !clientId || !clientSecret) {
      return null
    }

    const apiBase = conn?.apiUrl || null
    const tokenUrl = String(conn?.tokenUrl || conn?.oauth?.tokenUrl || (apiBase ? `${apiBase}/oauth2/token` : 'https://oauth2.googleapis.com/token'))
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    })

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      this.emit('error', new Error(`Google Drive token refresh failed: ${res.status}${errText ? ` ${errText}` : ''}`))
      return null
    }

    const data = await res.json().catch(() => ({}))
    const accessToken = data.access_token ? String(data.access_token) : null
    if (!accessToken) {
      return null
    }

    this._applyGdriveAccessToken(conn, accessToken, data.expires_in)
    return accessToken
  }

  async _downloadGdriveFile({ accessToken, conn, fileId }) {
    const id = String(fileId)
    const apiBase = conn?.apiUrl || 'https://www.googleapis.com'
    const url = `${apiBase}/drive/v3/files/${encodeURIComponent(id)}?alt=media`

    let token = accessToken ? String(accessToken) : this._getGdriveAccessToken(conn)
    if (!token) {
      token = await this._refreshGdriveAccessToken(conn)
    }
    if (!token) {
      throw new Error('Google Drive access token missing')
    }

    let res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (res.status === 401) {
      const refreshed = await this._refreshGdriveAccessToken(conn)
      if (refreshed) {
        token = refreshed
        res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
      }
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`Google Drive download failed: ${res.status}${errText ? ` ${errText}` : ''}`)
    }

    const arr = await res.arrayBuffer()
    return Buffer.from(arr)
  }

  async _syncOnedriveConnection(conn) {
    let accessToken = conn?.accessToken || conn?.oauth?.accessToken || conn?.oauthConfig?.accessToken
    if (!accessToken) {
      accessToken = await this._refreshOnedriveAccessToken(conn)
      if (!accessToken) {
        return []
      }
    }

    const driveId = conn?.driveId || null
    const folderIdsRaw = Array.isArray(conn?.folderIds)
      ? conn.folderIds
      : conn?.folderId
        ? [conn.folderId]
        : ['root']

    const folderIds = Array.from(new Set(folderIdsRaw.map((v) => String(v)).map((v) => v.trim()).filter(Boolean)))
    const invoices = []

    for (const folderId of folderIds) {
      const deltaKey = `onedrive:${conn?.id || 'onedrive'}:${driveId || 'me'}:${folderId}`
      let deltaLink = this._onedriveDeltaLinks.get(deltaKey) || null

      const apiBase = conn?.apiUrl || 'https://graph.microsoft.com'
      const baseUrl = driveId
        ? `${apiBase}/v1.0/drives/${encodeURIComponent(driveId)}`
        : `${apiBase}/v1.0/me/drive`

      let url = deltaLink
        ? deltaLink
        : folderId === 'root'
          ? `${baseUrl}/root/delta`
          : `${baseUrl}/items/${encodeURIComponent(folderId)}/delta`

      let hasMore = true

      while (hasMore) {
        let listRes = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })

        if (listRes.status === 401) {
          const refreshed = await this._refreshOnedriveAccessToken(conn)
          if (refreshed) {
            accessToken = refreshed
            listRes = await fetch(url, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
              },
            })
          }
        }

        if (!listRes.ok) {
          const errText = await listRes.text().catch(() => '')
          this.emit('error', new Error(`OneDrive delta failed: ${listRes.status}${errText ? ` ${errText}` : ''}`))
          break
        }

        const data = await listRes.json().catch(() => ({}))
        const items = Array.isArray(data.value) ? data.value : []

        for (const item of items) {
          if (item.deleted || item.folder) continue

          const name = String(item.name || '')
          if (!this._isInvoiceFileName(name)) continue

          const key = `onedrive:${conn?.id || 'onedrive'}:${item.id || name}:${item.eTag || item.lastModifiedDateTime || ''}`
          if (this.processedFiles.has(key)) continue

          if (this.inbox && typeof this.inbox.getInvoiceBySourceKey === 'function') {
            const existing = await this.inbox.getInvoiceBySourceKey(key)
            if (existing) {
              this.processedFiles.add(key)
              continue
            }
          }

          const content = await this._downloadOnedriveFile({ accessToken, conn, itemId: item.id })
          const ext = path.extname(name).toLowerCase()

          if (this.inbox) {
            const invoice = await this.inbox.addInvoice('storage', content, {
              fileName: name,
              fileType: item.file?.mimeType || this._getMimeType(ext),
              fileSize: item.size != null ? Number(item.size) : null,
              sourceKey: key,
              storageType: STORAGE_PROVIDERS.ONEDRIVE,
              storageProviderId: conn?.id || null,
              storageId: item.id || null,
              sourcePath: item.parentReference?.path ? `${item.parentReference.path}/${name}` : null,
              remoteUrl: item.webUrl || null,
            })
            invoices.push(invoice)
            this.emit('invoice:found', invoice)
          }

          this.processedFiles.add(key)
        }

        if (data['@odata.nextLink']) {
          url = data['@odata.nextLink']
        } else {
          hasMore = false
          if (data['@odata.deltaLink']) {
            this._onedriveDeltaLinks.set(deltaKey, data['@odata.deltaLink'])
            this.emit('state:changed', this.getState())
          }
        }
      }
    }

    this.emit('onedrive:sync', { connectionId: conn?.id || null, folderIds })
    return invoices
  }

  async _refreshOnedriveAccessToken(conn) {
    const refreshToken = conn?.refreshToken || conn?.oauth?.refreshToken || conn?.oauthConfig?.refreshToken
    const clientId = conn?.clientId || conn?.oauth?.clientId || conn?.oauthConfig?.clientId || this.oauthConfig?.clientId
    const clientSecret = conn?.clientSecret || conn?.oauth?.clientSecret || conn?.oauthConfig?.clientSecret || this.oauthConfig?.clientSecret

    if (!refreshToken || !clientId) {
      return null
    }

    const apiBase = conn?.apiUrl || null
    const tokenUrl = String(conn?.tokenUrl || conn?.oauth?.tokenUrl || (apiBase ? `${apiBase}/oauth2/v2.0/token` : 'https://login.microsoftonline.com/common/oauth2/v2.0/token'))
    const params = new URLSearchParams({
      client_id: clientId,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'Files.Read Files.Read.All offline_access',
    })

    if (clientSecret) {
      params.append('client_secret', clientSecret)
    }

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      this.emit('error', new Error(`OneDrive token refresh failed: ${res.status}${errText ? ` ${errText}` : ''}`))
      return null
    }

    const data = await res.json().catch(() => ({}))
    const accessToken = data.access_token ? String(data.access_token) : null
    if (!accessToken) {
      return null
    }

    this._applyOnedriveAccessToken(conn, accessToken, data.expires_in)
    return accessToken
  }

  _applyOnedriveAccessToken(conn, accessToken, expiresInSeconds) {
    const token = accessToken ? String(accessToken) : null
    if (!token) {
      return
    }

    const expiresAt =
      expiresInSeconds != null && !Number.isNaN(Number(expiresInSeconds))
        ? new Date(Date.now() + Number(expiresInSeconds) * 1000 - 10000).toISOString()
        : null

    conn.accessToken = token
    conn.oauth = {
      ...(conn.oauth || {}),
      accessToken: token,
      ...(expiresAt ? { expiresAt } : {}),
    }
    conn.oauthConfig = {
      ...(conn.oauthConfig || {}),
      accessToken: token,
      ...(expiresAt ? { expiresAt } : {}),
    }

    if (conn?.id) {
      const idx = this.connections.findIndex((c) => c && c.id === conn.id)
      if (idx >= 0) {
        this.connections[idx] = { ...this.connections[idx], ...conn }
      }
      this.emit('connection:updated', { connection: { ...conn } })
    }
  }

  async _downloadOnedriveFile({ accessToken, conn, itemId }) {
    const id = String(itemId)
    const driveId = conn?.driveId || null
    const apiBase = conn?.apiUrl || 'https://graph.microsoft.com'
    const baseUrl = driveId
      ? `${apiBase}/v1.0/drives/${encodeURIComponent(driveId)}`
      : `${apiBase}/v1.0/me/drive`
    const url = `${baseUrl}/items/${encodeURIComponent(id)}/content`

    let token = accessToken ? String(accessToken) : conn?.accessToken || conn?.oauth?.accessToken
    if (!token) {
      token = await this._refreshOnedriveAccessToken(conn)
    }
    if (!token) {
      throw new Error('OneDrive access token missing')
    }

    let res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      redirect: 'follow',
    })

    if (res.status === 401) {
      const refreshed = await this._refreshOnedriveAccessToken(conn)
      if (refreshed) {
        token = refreshed
        res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          redirect: 'follow',
        })
      }
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`OneDrive download failed: ${res.status}${errText ? ` ${errText}` : ''}`)
    }

    const arr = await res.arrayBuffer()
    return Buffer.from(arr)
  }

  async _syncNextcloudConnection(conn) {
    const username = conn?.username || conn?.user
    const password = conn?.password || conn?.appPassword
    const webdavUrl = conn?.webdavUrl || conn?.url || null
    const baseUrl = conn?.baseUrl || null
    const folderPath = conn?.folderPath || conn?.path || '/'

    const resolvedWebdavUrl = webdavUrl
      ? String(webdavUrl)
      : baseUrl && username
        ? String(baseUrl).replace(/\/$/, '') +
          '/remote.php/dav/files/' +
          encodeURIComponent(String(username)) +
          (String(folderPath || '/').startsWith('/') ? String(folderPath || '/') : `/${String(folderPath || '/')}`)
        : null

    if (!resolvedWebdavUrl || !username || !password) {
      return []
    }

    const auth = Buffer.from(`${String(username)}:${String(password)}`).toString('base64')

    const propfindBody =
      '<?xml version="1.0" encoding="utf-8" ?>' +
      '<d:propfind xmlns:d="DAV:">' +
      '<d:prop><d:getcontenttype/><d:getcontentlength/><d:getlastmodified/><d:getetag/></d:prop>' +
      '</d:propfind>'

    const listRes = await fetch(resolvedWebdavUrl, {
      method: 'PROPFIND',
      headers: {
        Authorization: `Basic ${auth}`,
        Depth: '1',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body: propfindBody,
    })

    if (!listRes.ok) {
      const errText = await listRes.text().catch(() => '')
      this.emit('error', new Error(`Nextcloud PROPFIND failed: ${listRes.status}${errText ? ` ${errText}` : ''}`))
      return []
    }

    const xml = await listRes.text().catch(() => '')
    const responses = xml.split(/<[^>]*response[^>]*>/i).slice(1)
    const invoices = []

    for (const chunk of responses) {
      const hrefMatch = chunk.match(/<[^>]*href[^>]*>([^<]+)<\/[^>]*href>/i)
      if (!hrefMatch) continue
      const hrefRaw = hrefMatch[1]
      const href = hrefRaw.replace(/&amp;/g, '&').trim()

      const name = decodeURIComponent(href.split('/').filter(Boolean).slice(-1)[0] || '')
      if (!name || !this._isInvoiceFileName(name)) continue

      const etagMatch = chunk.match(/<[^>]*getetag[^>]*>([^<]+)<\/[^>]*getetag>/i)
      const lastModMatch = chunk.match(/<[^>]*getlastmodified[^>]*>([^<]+)<\/[^>]*getlastmodified>/i)
      const sizeMatch = chunk.match(/<[^>]*getcontentlength[^>]*>([^<]+)<\/[^>]*getcontentlength>/i)
      const typeMatch = chunk.match(/<[^>]*getcontenttype[^>]*>([^<]+)<\/[^>]*getcontenttype>/i)

      const etag = etagMatch ? etagMatch[1].trim() : ''
      const lastModified = lastModMatch ? lastModMatch[1].trim() : ''
      const size = sizeMatch ? Number(String(sizeMatch[1]).trim()) : null
      const mimeType = typeMatch ? typeMatch[1].trim() : null

      const key = `nextcloud:${conn?.id || 'nextcloud'}:${href}:${etag || lastModified}`
      if (this.processedFiles.has(key)) continue

      if (this.inbox && typeof this.inbox.getInvoiceBySourceKey === 'function') {
        const existing = await this.inbox.getInvoiceBySourceKey(key)
        if (existing) {
          this.processedFiles.add(key)
          continue
        }
      }

      const downloadUrl = new URL(href, resolvedWebdavUrl).toString()
      const fileRes = await fetch(downloadUrl, {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      })

      if (!fileRes.ok) {
        const errText = await fileRes.text().catch(() => '')
        this.emit('error', new Error(`Nextcloud download failed: ${fileRes.status}${errText ? ` ${errText}` : ''}`))
        continue
      }

      const arr = await fileRes.arrayBuffer()
      const content = Buffer.from(arr)
      const ext = path.extname(name).toLowerCase()

      if (this.inbox) {
        const invoice = await this.inbox.addInvoice('storage', content, {
          fileName: name,
          fileType: mimeType || this._getMimeType(ext),
          fileSize: size != null && !Number.isNaN(size) ? size : content.length,
          sourceKey: key,
          storageType: STORAGE_PROVIDERS.NEXTCLOUD,
          storageProviderId: conn?.id || null,
          sourcePath: href || null,
          remoteUrl: downloadUrl,
        })
        invoices.push(invoice)
        this.emit('invoice:found', invoice)
      }

      this.processedFiles.add(key)
    }

    this.emit('nextcloud:sync', { connectionId: conn?.id || null, url: resolvedWebdavUrl })
    return invoices
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

  _isInvoiceFileName(fileNameOrPath) {
    const ext = path.extname(String(fileNameOrPath || '')).toLowerCase()
    return INVOICE_EXTENSIONS.includes(ext)
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

  setConnections(connections) {
    this.connections = Array.isArray(connections) ? connections : []
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
