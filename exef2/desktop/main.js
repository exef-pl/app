const { app, BrowserWindow, ipcMain, Menu, shell, dialog } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store({
    defaults: {
        windowBounds: { width: 1200, height: 800 },
        serverUrl: 'http://localhost:8000',
        offlineMode: false
    }
});

let mainWindow;
let db;
let sync;

function createWindow() {
    const { width, height } = store.get('windowBounds');
    
    mainWindow = new BrowserWindow({
        width,
        height,
        minWidth: 900,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        icon: path.join(__dirname, 'assets', 'icon.png'),
        titleBarStyle: 'default',
        show: false
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('resize', () => {
        const { width, height } = mainWindow.getBounds();
        store.set('windowBounds', { width, height });
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Load the app
    const serverUrl = store.get('serverUrl');
    if (store.get('offlineMode')) {
        mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    } else {
        mainWindow.loadURL(serverUrl);
    }

    createMenu();
}

function createMenu() {
    const template = [
        {
            label: 'EXEF',
            submenu: [
                {
                    label: 'O programie',
                    click: () => showAbout()
                },
                { type: 'separator' },
                {
                    label: 'Ustawienia',
                    accelerator: 'CmdOrCtrl+,',
                    click: () => mainWindow.webContents.send('open-settings')
                },
                { type: 'separator' },
                {
                    label: 'Zamknij',
                    accelerator: 'CmdOrCtrl+Q',
                    click: () => app.quit()
                }
            ]
        },
        {
            label: 'Edycja',
            submenu: [
                { role: 'undo', label: 'Cofnij' },
                { role: 'redo', label: 'Ponów' },
                { type: 'separator' },
                { role: 'cut', label: 'Wytnij' },
                { role: 'copy', label: 'Kopiuj' },
                { role: 'paste', label: 'Wklej' },
                { role: 'selectAll', label: 'Zaznacz wszystko' }
            ]
        },
        {
            label: 'Widok',
            submenu: [
                { role: 'reload', label: 'Odśwież' },
                { role: 'forceReload', label: 'Wymuś odświeżenie' },
                { type: 'separator' },
                { role: 'zoomIn', label: 'Powiększ' },
                { role: 'zoomOut', label: 'Pomniejsz' },
                { role: 'resetZoom', label: 'Resetuj zoom' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: 'Pełny ekran' }
            ]
        },
        {
            label: 'Dokumenty',
            submenu: [
                {
                    label: 'Nowy dokument',
                    accelerator: 'CmdOrCtrl+N',
                    click: () => mainWindow.webContents.send('navigate', 'create')
                },
                {
                    label: 'Lista dokumentów',
                    accelerator: 'CmdOrCtrl+L',
                    click: () => mainWindow.webContents.send('navigate', 'docs')
                },
                { type: 'separator' },
                {
                    label: 'Import',
                    accelerator: 'CmdOrCtrl+I',
                    click: () => mainWindow.webContents.send('navigate', 'import')
                },
                {
                    label: 'Export',
                    accelerator: 'CmdOrCtrl+E',
                    click: () => mainWindow.webContents.send('navigate', 'export')
                }
            ]
        },
        {
            label: 'Pomoc',
            submenu: [
                {
                    label: 'Dokumentacja',
                    click: () => shell.openExternal('https://github.com/exef-pl/exef')
                },
                {
                    label: 'Zgłoś błąd',
                    click: () => shell.openExternal('https://github.com/exef-pl/exef/issues')
                },
                { type: 'separator' },
                {
                    label: 'Narzędzia deweloperskie',
                    accelerator: 'F12',
                    click: () => mainWindow.webContents.toggleDevTools()
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

function showAbout() {
    const { dialog } = require('electron');
    dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'O programie EXEF',
        message: 'EXEF - System Faktur Elektronicznych',
        detail: `Wersja: 2.0.0\n\nAplikacja do zarządzania fakturami elektronicznymi z integracją KSeF.\n\n© 2026 EXEF Team`
    });
}

// IPC Handlers
ipcMain.handle('get-setting', (event, key) => {
    return store.get(key);
});

ipcMain.handle('set-setting', (event, key, value) => {
    store.set(key, value);
    return true;
});

ipcMain.handle('get-offline-mode', () => {
    return store.get('offlineMode');
});

ipcMain.handle('set-offline-mode', (event, enabled) => {
    store.set('offlineMode', enabled);
    if (enabled) {
        if (sync) sync.stopAutoSync();
        mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    } else {
        if (sync && db) sync.startAutoSync(30000);
        mainWindow.loadURL(store.get('serverUrl'));
    }
    return true;
});

// Database IPC handlers (for offline mode)
ipcMain.handle('db-get-profiles', () => db ? db.getProfiles() : []);
ipcMain.handle('db-get-profile', (event, id) => db ? db.getProfile(id) : null);
ipcMain.handle('db-create-profile', (event, profile) => db ? db.createProfile(profile) : null);
ipcMain.handle('db-update-profile', (event, id, updates) => db ? db.updateProfile(id, updates) : null);
ipcMain.handle('db-delete-profile', (event, id) => db ? db.deleteProfile(id) : false);

ipcMain.handle('db-get-documents', (event, profileId) => db ? db.getDocuments(profileId) : []);
ipcMain.handle('db-get-document', (event, profileId, id) => db ? db.getDocument(profileId, id) : null);
ipcMain.handle('db-create-document', (event, profileId, doc) => db ? db.createDocument(profileId, doc) : null);
ipcMain.handle('db-update-document', (event, profileId, id, updates) => db ? db.updateDocument(profileId, id, updates) : null);
ipcMain.handle('db-delete-document', (event, profileId, id) => db ? db.deleteDocument(profileId, id) : false);

ipcMain.handle('db-get-endpoints', (event, profileId) => db ? db.getEndpoints(profileId) : []);
ipcMain.handle('db-create-endpoint', (event, profileId, endpoint) => db ? db.createEndpoint(profileId, endpoint) : null);
ipcMain.handle('db-delete-endpoint', (event, profileId, id) => db ? db.deleteEndpoint(profileId, id) : false);

ipcMain.handle('db-get-stats', (event, profileId) => db ? db.getStats(profileId) : {});

// Sync IPC handlers
ipcMain.handle('sync-force', () => sync ? sync.forceSync() : Promise.resolve());
ipcMain.handle('sync-status', () => ({ online: sync ? sync.isOnline() : false, dbAvailable: !!db }));
ipcMain.handle('sync-pull', (event, profileId) => sync ? sync.pullFromServer(profileId) : null);

// File dialog handlers
ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Documents', extensions: ['pdf', 'jpg', 'jpeg', 'png'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('save-file', async (event, data, defaultPath) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath,
        filters: [
            { name: 'CSV', extensions: ['csv'] },
            { name: 'XML', extensions: ['xml'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    if (!result.canceled && result.filePath) {
        require('fs').writeFileSync(result.filePath, data);
        return result.filePath;
    }
    return null;
});

// App lifecycle
app.whenReady().then(() => {
    // Initialize database (may fail if native module not rebuilt)
    try {
        db = require('./database');
        db.initialize();
        console.log('Local database initialized');
    } catch (err) {
        console.error('Database init failed (run npm rebuild):', err.message);
        db = null;
    }
    
    // Initialize sync
    try {
        sync = require('./sync');
        sync.setServerUrl(store.get('serverUrl'));
        sync.setStatusCallback((status) => {
            if (mainWindow) {
                mainWindow.webContents.send('sync-status', status);
            }
        });
        
        // Start auto-sync if not in offline mode and db available
        if (!store.get('offlineMode') && db) {
            sync.startAutoSync(30000);
        }
    } catch (err) {
        console.error('Sync init failed:', err.message);
        sync = null;
    }
    
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Handle certificate errors for local development
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    if (url.startsWith('https://localhost')) {
        event.preventDefault();
        callback(true);
    } else {
        callback(false);
    }
});
