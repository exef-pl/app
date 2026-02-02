const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
    // Settings
    getSetting: (key) => ipcRenderer.invoke('get-setting', key),
    setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
    
    // Offline mode
    getOfflineMode: () => ipcRenderer.invoke('get-offline-mode'),
    setOfflineMode: (enabled) => ipcRenderer.invoke('set-offline-mode', enabled),
    
    // Navigation from menu
    onNavigate: (callback) => ipcRenderer.on('navigate', (event, view) => callback(view)),
    onOpenSettings: (callback) => ipcRenderer.on('open-settings', () => callback()),
    
    // App info
    getVersion: () => '2.0.0',
    getPlatform: () => process.platform,
    
    // Sync
    onSyncStatus: (callback) => ipcRenderer.on('sync-status', (event, status) => callback(status)),
    forceSync: () => ipcRenderer.invoke('sync-force'),
    getSyncStatus: () => ipcRenderer.invoke('sync-status'),
    pullFromServer: (profileId) => ipcRenderer.invoke('sync-pull', profileId),
    
    // File operations
    selectFile: () => ipcRenderer.invoke('select-file'),
    saveFile: (data, defaultPath) => ipcRenderer.invoke('save-file', data, defaultPath),
    
    // Database - Profiles
    getProfiles: () => ipcRenderer.invoke('db-get-profiles'),
    getProfile: (id) => ipcRenderer.invoke('db-get-profile', id),
    createProfile: (profile) => ipcRenderer.invoke('db-create-profile', profile),
    updateProfile: (id, updates) => ipcRenderer.invoke('db-update-profile', id, updates),
    deleteProfile: (id) => ipcRenderer.invoke('db-delete-profile', id),
    
    // Database - Documents
    getDocuments: (profileId) => ipcRenderer.invoke('db-get-documents', profileId),
    getDocument: (profileId, id) => ipcRenderer.invoke('db-get-document', profileId, id),
    createDocument: (profileId, doc) => ipcRenderer.invoke('db-create-document', profileId, doc),
    updateDocument: (profileId, id, updates) => ipcRenderer.invoke('db-update-document', profileId, id, updates),
    deleteDocument: (profileId, id) => ipcRenderer.invoke('db-delete-document', profileId, id),
    
    // Database - Endpoints
    getEndpoints: (profileId) => ipcRenderer.invoke('db-get-endpoints', profileId),
    createEndpoint: (profileId, endpoint) => ipcRenderer.invoke('db-create-endpoint', profileId, endpoint),
    deleteEndpoint: (profileId, id) => ipcRenderer.invoke('db-delete-endpoint', profileId, id),
    
    // Database - Stats
    getStats: (profileId) => ipcRenderer.invoke('db-get-stats', profileId)
});

// Notify when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    console.log('EXEF Desktop v2.0.0 loaded');
});
