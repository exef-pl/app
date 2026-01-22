/**
 * Storage Sync
 * Synchronizacja faktur z chmury (Dropbox, Google Drive) i lokalnych folderów
 */

const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');
const chokidar = require('chokidar'); // npm install chokidar

const SUPPORTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

class StorageSync extends EventEmitter {
  constructor(options = {}) {
    super();
    this.providers = new Map();
    this.watchers = new Map();
    this.processedFiles = new Set();
  }

  /**
   * Dodaj lokalny folder do monitorowania
   */
  addLocalFolder(providerId, folderPath, options = {}) {
    const provider = {
      id: providerId,
      type: 'local',
      path: folderPath,
      recursive: options.recursive !== false,
      enabled: true,
      lastSync: null
    };
    
    this.providers.set(providerId, provider);
    this.emit('provider:added', provider);
    return provider;
  }

  /**
   * Dodaj Dropbox (wymaga access token)
   */
  addDropbox(providerId, { accessToken, folderPath = '/Faktury' }) {
    const provider = {
      id: providerId,
      type: 'dropbox',
      accessToken,
      path: folderPath,
      enabled: true,
      lastSync: null
    };
    
    this.providers.set(providerId, provider);
    return provider;
  }

  /**
   * Dodaj Google Drive (wymaga OAuth credentials)
   */
  addGoogleDrive(providerId, { credentials, folderId }) {
    const provider = {
      id: providerId,
      type: 'gdrive',
      credentials,
      folderId,
      enabled: true,
      lastSync: null
    };
    
    this.providers.set(providerId, provider);
    return provider;
  }

  /**
   * Rozpocznij monitoring
   */
  startWatching() {
    for (const [providerId, provider] of this.providers) {
      if (provider.enabled) {
        this._watchProvider(providerId);
      }
    }
  }

  /**
   * Zatrzymaj monitoring
   */
  stopWatching() {
    for (const [providerId, watcher] of this.watchers) {
      watcher.close();
      this.watchers.delete(providerId);
    }
  }

  /**
   * Skanuj provider jednorazowo
   */
  async scanProvider(providerId) {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Provider ${providerId} not found`);
    
    switch (provider.type) {
      case 'local':
        return this._scanLocalFolder(provider);
      case 'dropbox':
        return this._scanDropbox(provider);
      case 'gdrive':
        return this._scanGoogleDrive(provider);
      default:
        throw new Error(`Unknown provider type: ${provider.type}`);
    }
  }

  // --- Private: Local folder ---

  _watchProvider(providerId) {
    const provider = this.providers.get(providerId);
    
    if (provider.type === 'local') {
      this._watchLocalFolder(provider);
    } else {
      // Dla chmury używamy pollingu
      this._pollCloudProvider(providerId);
    }
  }

  _watchLocalFolder(provider) {
    const watcher = chokidar.watch(provider.path, {
      persistent: true,
      ignoreInitial: false,
      depth: provider.recursive ? undefined : 0,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    });
    
    watcher.on('add', async (filePath) => {
      if (this._isInvoiceFile(filePath)) {
        await this._processLocalFile(provider, filePath);
      }
    });
    
    watcher.on('error', (error) => {
      this.emit('error', { providerId: provider.id, error });
    });
    
    this.watchers.set(provider.id, watcher);
  }

  async _scanLocalFolder(provider) {
    const invoices = [];
    const files = await this._listFilesRecursive(provider.path, provider.recursive);
    
    for (const filePath of files) {
      if (this._isInvoiceFile(filePath) && !this.processedFiles.has(filePath)) {
        const invoice = await this._processLocalFile(provider, filePath);
        if (invoice) invoices.push(invoice);
      }
    }
    
    provider.lastSync = new Date();
    return invoices;
  }

  async _processLocalFile(provider, filePath) {
    if (this.processedFiles.has(filePath)) return null;
    
    try {
      const stat = await fs.stat(filePath);
      const content = await fs.readFile(filePath);
      
      const invoice = {
        source: 'storage',
        file: {
          name: path.basename(filePath),
          path: filePath,
          mimeType: this._getMimeType(filePath),
          size: stat.size,
          content
        },
        metadata: {
          storagePath: filePath,
          storageProvider: provider.id,
          storageType: 'local',
          fileModified: stat.mtime
        }
      };
      
      this.processedFiles.add(filePath);
      this.emit('invoice:found', invoice);
      return invoice;
      
    } catch (error) {
      this.emit('error', { providerId: provider.id, filePath, error });
      return null;
    }
  }

  async _listFilesRecursive(dir, recursive = true) {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory() && recursive) {
        files.push(...await this._listFilesRecursive(fullPath, recursive));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  // --- Private: Dropbox ---

  async _scanDropbox(provider) {
    const invoices = [];
    
    try {
      // Używamy Dropbox API v2
      const response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${provider.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: provider.path,
          recursive: true
        })
      });
      
      const data = await response.json();
      
      for (const entry of data.entries || []) {
        if (entry['.tag'] === 'file' && this._isInvoiceFile(entry.name)) {
          const fileKey = `dropbox:${entry.id}`;
          
          if (!this.processedFiles.has(fileKey)) {
            const content = await this._downloadDropboxFile(provider, entry.path_display);
            
            const invoice = {
              source: 'storage',
              file: {
                name: entry.name,
                path: entry.path_display,
                mimeType: this._getMimeType(entry.name),
                size: entry.size,
                content
              },
              metadata: {
                storagePath: entry.path_display,
                storageProvider: provider.id,
                storageType: 'dropbox',
                fileModified: entry.server_modified
              }
            };
            
            this.processedFiles.add(fileKey);
            this.emit('invoice:found', invoice);
            invoices.push(invoice);
          }
        }
      }
      
      provider.lastSync = new Date();
      
    } catch (error) {
      this.emit('error', { providerId: provider.id, error });
    }
    
    return invoices;
  }

  async _downloadDropboxFile(provider, filePath) {
    const response = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${provider.accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({ path: filePath })
      }
    });
    
    return Buffer.from(await response.arrayBuffer());
  }

  // --- Private: Google Drive ---

  async _scanGoogleDrive(provider) {
    const invoices = [];
    
    try {
      // Używamy Google Drive API v3
      const query = `'${provider.folderId}' in parents and trashed=false`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,modifiedTime)`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${provider.credentials.access_token}`
        }
      });
      
      const data = await response.json();
      
      for (const file of data.files || []) {
        if (this._isInvoiceFile(file.name)) {
          const fileKey = `gdrive:${file.id}`;
          
          if (!this.processedFiles.has(fileKey)) {
            const content = await this._downloadGDriveFile(provider, file.id);
            
            const invoice = {
              source: 'storage',
              file: {
                name: file.name,
                path: file.id,
                mimeType: file.mimeType,
                size: parseInt(file.size),
                content
              },
              metadata: {
                storagePath: file.id,
                storageProvider: provider.id,
                storageType: 'gdrive',
                fileModified: file.modifiedTime
              }
            };
            
            this.processedFiles.add(fileKey);
            this.emit('invoice:found', invoice);
            invoices.push(invoice);
          }
        }
      }
      
      provider.lastSync = new Date();
      
    } catch (error) {
      this.emit('error', { providerId: provider.id, error });
    }
    
    return invoices;
  }

  async _downloadGDriveFile(provider, fileId) {
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: {
          'Authorization': `Bearer ${provider.credentials.access_token}`
        }
      }
    );
    
    return Buffer.from(await response.arrayBuffer());
  }

  // --- Private: Cloud polling ---

  _pollCloudProvider(providerId) {
    // Poll co 5 minut
    const timer = setInterval(() => {
      this.scanProvider(providerId);
    }, 5 * 60 * 1000);
    
    // Pierwsze sprawdzenie od razu
    this.scanProvider(providerId);
    
    this.watchers.set(providerId, { close: () => clearInterval(timer) });
  }

  // --- Private: Helpers ---

  _isInvoiceFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return SUPPORTED_EXTENSIONS.includes(ext);
  }

  _getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}

function createStorageSync(options) {
  return new StorageSync(options);
}

module.exports = {
  StorageSync,
  createStorageSync,
  SUPPORTED_EXTENSIONS
};
