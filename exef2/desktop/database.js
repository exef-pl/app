const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

let db = null;

function getDbPath() {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'exef.db');
}

function initialize() {
    if (db) return db;
    
    const dbPath = getDbPath();
    db = new Database(dbPath);
    
    // Enable WAL mode for better performance
    db.pragma('journal_mode = WAL');
    
    // Create tables
    db.exec(`
        CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            nip TEXT,
            data TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            synced_at TEXT
        );
        
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            profile_id TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            synced_at TEXT,
            sync_status TEXT DEFAULT 'pending',
            FOREIGN KEY (profile_id) REFERENCES profiles(id)
        );
        
        CREATE TABLE IF NOT EXISTS endpoints (
            id TEXT PRIMARY KEY,
            profile_id TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            synced_at TEXT,
            sync_status TEXT DEFAULT 'pending',
            FOREIGN KEY (profile_id) REFERENCES profiles(id)
        );
        
        CREATE TABLE IF NOT EXISTS sync_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            action TEXT NOT NULL,
            data TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            attempts INTEGER DEFAULT 0,
            last_error TEXT
        );
        
        CREATE INDEX IF NOT EXISTS idx_documents_profile ON documents(profile_id);
        CREATE INDEX IF NOT EXISTS idx_endpoints_profile ON endpoints(profile_id);
        CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(attempts);
    `);
    
    // Create default profile if not exists
    const defaultProfile = db.prepare('SELECT id FROM profiles WHERE id = ?').get('default');
    if (!defaultProfile) {
        db.prepare(`
            INSERT INTO profiles (id, name, nip, data) 
            VALUES (?, ?, ?, ?)
        `).run('default', 'Domyślny profil', '', JSON.stringify({}));
    }
    
    return db;
}

function close() {
    if (db) {
        db.close();
        db = null;
    }
}

// Profiles
function getProfiles() {
    const rows = db.prepare('SELECT * FROM profiles ORDER BY name').all();
    return rows.map(row => ({
        ...JSON.parse(row.data || '{}'),
        id: row.id,
        name: row.name,
        nip: row.nip
    }));
}

function getProfile(id) {
    const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
    if (!row) return null;
    return {
        ...JSON.parse(row.data || '{}'),
        id: row.id,
        name: row.name,
        nip: row.nip
    };
}

function createProfile(profile) {
    const id = profile.id || require('crypto').randomUUID();
    db.prepare(`
        INSERT INTO profiles (id, name, nip, data, sync_status) 
        VALUES (?, ?, ?, ?, 'pending')
    `).run(id, profile.name, profile.nip || '', JSON.stringify(profile));
    
    addToSyncQueue('profile', id, 'create', profile);
    return { ...profile, id };
}

function updateProfile(id, updates) {
    const existing = getProfile(id);
    if (!existing) return null;
    
    const updated = { ...existing, ...updates };
    db.prepare(`
        UPDATE profiles SET name = ?, nip = ?, data = ?, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
        WHERE id = ?
    `).run(updated.name, updated.nip || '', JSON.stringify(updated), id);
    
    addToSyncQueue('profile', id, 'update', updated);
    return updated;
}

function deleteProfile(id) {
    if (id === 'default') return false;
    
    db.prepare('DELETE FROM documents WHERE profile_id = ?').run(id);
    db.prepare('DELETE FROM endpoints WHERE profile_id = ?').run(id);
    db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
    
    addToSyncQueue('profile', id, 'delete', null);
    return true;
}

// Documents
function getDocuments(profileId) {
    const rows = db.prepare('SELECT * FROM documents WHERE profile_id = ? ORDER BY created_at DESC').all(profileId);
    return rows.map(row => JSON.parse(row.data));
}

function getDocument(profileId, id) {
    const row = db.prepare('SELECT * FROM documents WHERE id = ? AND profile_id = ?').get(id, profileId);
    if (!row) return null;
    return JSON.parse(row.data);
}

function createDocument(profileId, doc) {
    const id = doc.id || require('crypto').randomUUID();
    const document = { ...doc, id, profile_id: profileId, created_at: new Date().toISOString() };
    
    db.prepare(`
        INSERT INTO documents (id, profile_id, data, sync_status) 
        VALUES (?, ?, ?, 'pending')
    `).run(id, profileId, JSON.stringify(document));
    
    addToSyncQueue('document', id, 'create', document);
    return document;
}

function updateDocument(profileId, id, updates) {
    const existing = getDocument(profileId, id);
    if (!existing) return null;
    
    const updated = { ...existing, ...updates, updated_at: new Date().toISOString() };
    db.prepare(`
        UPDATE documents SET data = ?, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
        WHERE id = ? AND profile_id = ?
    `).run(JSON.stringify(updated), id, profileId);
    
    addToSyncQueue('document', id, 'update', updated);
    return updated;
}

function deleteDocument(profileId, id) {
    db.prepare('DELETE FROM documents WHERE id = ? AND profile_id = ?').run(id, profileId);
    addToSyncQueue('document', id, 'delete', { profile_id: profileId });
    return true;
}

// Endpoints
function getEndpoints(profileId) {
    const rows = db.prepare('SELECT * FROM endpoints WHERE profile_id = ?').all(profileId);
    return rows.map(row => JSON.parse(row.data));
}

function createEndpoint(profileId, endpoint) {
    const id = endpoint.id || require('crypto').randomUUID();
    const ep = { ...endpoint, id, profile_id: profileId };
    
    db.prepare(`
        INSERT INTO endpoints (id, profile_id, data, sync_status) 
        VALUES (?, ?, ?, 'pending')
    `).run(id, profileId, JSON.stringify(ep));
    
    addToSyncQueue('endpoint', id, 'create', ep);
    return ep;
}

function deleteEndpoint(profileId, id) {
    db.prepare('DELETE FROM endpoints WHERE id = ? AND profile_id = ?').run(id, profileId);
    addToSyncQueue('endpoint', id, 'delete', { profile_id: profileId });
    return true;
}

// Sync Queue
function addToSyncQueue(entityType, entityId, action, data) {
    db.prepare(`
        INSERT INTO sync_queue (entity_type, entity_id, action, data)
        VALUES (?, ?, ?, ?)
    `).run(entityType, entityId, action, data ? JSON.stringify(data) : null);
}

function getPendingSyncItems(limit = 50) {
    return db.prepare(`
        SELECT * FROM sync_queue 
        WHERE attempts < 3 
        ORDER BY created_at ASC 
        LIMIT ?
    `).all(limit);
}

function markSyncItemDone(id) {
    db.prepare('DELETE FROM sync_queue WHERE id = ?').run(id);
}

function markSyncItemFailed(id, error) {
    db.prepare(`
        UPDATE sync_queue SET attempts = attempts + 1, last_error = ?
        WHERE id = ?
    `).run(error, id);
}

// Stats
function getStats(profileId) {
    const docs = db.prepare(`
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN json_extract(data, '$.status') = 'created' THEN 1 ELSE 0 END) as created,
            SUM(CASE WHEN json_extract(data, '$.status') = 'described' THEN 1 ELSE 0 END) as described,
            SUM(CASE WHEN json_extract(data, '$.status') = 'signed' THEN 1 ELSE 0 END) as signed,
            SUM(CASE WHEN json_extract(data, '$.status') = 'sent' THEN 1 ELSE 0 END) as sent
        FROM documents WHERE profile_id = ?
    `).get(profileId);
    
    const endpoints = db.prepare(`
        SELECT 
            SUM(CASE WHEN json_extract(data, '$.type') = 'import' THEN 1 ELSE 0 END) as import_count,
            SUM(CASE WHEN json_extract(data, '$.type') = 'export' THEN 1 ELSE 0 END) as export_count
        FROM endpoints WHERE profile_id = ?
    `).get(profileId);
    
    const pending = db.prepare('SELECT COUNT(*) as count FROM sync_queue WHERE attempts < 3').get();
    
    return {
        documents: {
            total: docs.total,
            by_status: {
                created: docs.created,
                described: docs.described,
                signed: docs.signed,
                sent: docs.sent
            }
        },
        endpoints: {
            import: endpoints.import_count || 0,
            export: endpoints.export_count || 0
        },
        sync: {
            pending: pending.count
        }
    };
}

module.exports = {
    initialize,
    close,
    getDbPath,
    // Profiles
    getProfiles,
    getProfile,
    createProfile,
    updateProfile,
    deleteProfile,
    // Documents
    getDocuments,
    getDocument,
    createDocument,
    updateDocument,
    deleteDocument,
    // Endpoints
    getEndpoints,
    createEndpoint,
    deleteEndpoint,
    // Sync
    getPendingSyncItems,
    markSyncItemDone,
    markSyncItemFailed,
    // Stats
    getStats
};
