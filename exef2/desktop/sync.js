const { net } = require('electron');
const db = require('./database');

let syncInterval = null;
let serverUrl = 'http://localhost:8000';
let isOnline = false;
let syncInProgress = false;
let onStatusChange = null;

function setServerUrl(url) {
    serverUrl = url;
}

function setStatusCallback(callback) {
    onStatusChange = callback;
}

function notifyStatus(status) {
    if (onStatusChange) {
        onStatusChange(status);
    }
}

async function checkOnline() {
    try {
        const response = await fetch(`${serverUrl}/health`, { 
            method: 'GET',
            timeout: 5000 
        });
        isOnline = response.ok;
    } catch {
        isOnline = false;
    }
    return isOnline;
}

async function syncItem(item) {
    const { entity_type, entity_id, action, data } = item;
    const parsedData = data ? JSON.parse(data) : null;
    
    let url, method, body;
    
    switch (entity_type) {
        case 'profile':
            if (action === 'create') {
                url = `${serverUrl}/api/profiles`;
                method = 'POST';
                body = parsedData;
            } else if (action === 'update') {
                url = `${serverUrl}/api/profiles/${entity_id}`;
                method = 'PUT';
                body = parsedData;
            } else if (action === 'delete') {
                url = `${serverUrl}/api/profiles/${entity_id}`;
                method = 'DELETE';
            }
            break;
            
        case 'document':
            const profileId = parsedData?.profile_id;
            if (action === 'create') {
                url = `${serverUrl}/api/profiles/${profileId}/documents`;
                method = 'POST';
                body = parsedData;
            } else if (action === 'update') {
                url = `${serverUrl}/api/profiles/${profileId}/documents/${entity_id}`;
                method = 'PUT';
                body = parsedData;
            } else if (action === 'delete') {
                url = `${serverUrl}/api/profiles/${profileId}/documents/${entity_id}`;
                method = 'DELETE';
            }
            break;
            
        case 'endpoint':
            const epProfileId = parsedData?.profile_id;
            if (action === 'create') {
                url = `${serverUrl}/api/profiles/${epProfileId}/endpoints`;
                method = 'POST';
                body = parsedData;
            } else if (action === 'delete') {
                url = `${serverUrl}/api/profiles/${epProfileId}/endpoints/${entity_id}`;
                method = 'DELETE';
            }
            break;
    }
    
    if (!url) {
        console.error(`Unknown sync item: ${entity_type}/${action}`);
        return false;
    }
    
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    
    if (body && method !== 'DELETE') {
        options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    return response.ok || response.status === 404; // 404 is ok for deletes
}

async function processSyncQueue() {
    if (syncInProgress || !isOnline) return;
    
    syncInProgress = true;
    notifyStatus({ syncing: true, pending: 0 });
    
    try {
        const items = db.getPendingSyncItems(20);
        let synced = 0;
        let failed = 0;
        
        for (const item of items) {
            try {
                const success = await syncItem(item);
                if (success) {
                    db.markSyncItemDone(item.id);
                    synced++;
                } else {
                    db.markSyncItemFailed(item.id, 'Server returned error');
                    failed++;
                }
            } catch (error) {
                db.markSyncItemFailed(item.id, error.message);
                failed++;
            }
        }
        
        const remaining = db.getPendingSyncItems(1).length;
        notifyStatus({ 
            syncing: false, 
            pending: remaining,
            lastSync: new Date().toISOString(),
            lastResult: { synced, failed }
        });
        
    } catch (error) {
        console.error('Sync error:', error);
        notifyStatus({ syncing: false, error: error.message });
    } finally {
        syncInProgress = false;
    }
}

async function pullFromServer(profileId) {
    if (!isOnline) return null;
    
    try {
        // Pull documents
        const docsResponse = await fetch(`${serverUrl}/api/profiles/${profileId}/documents`);
        if (docsResponse.ok) {
            const serverDocs = await docsResponse.json();
            // Merge with local (server wins for conflicts)
            for (const doc of serverDocs) {
                const local = db.getDocument(profileId, doc.id);
                if (!local) {
                    // New from server
                    db.createDocument(profileId, doc);
                } else if (new Date(doc.updated_at) > new Date(local.updated_at)) {
                    // Server is newer
                    db.updateDocument(profileId, doc.id, doc);
                }
            }
        }
        
        // Pull endpoints
        const epsResponse = await fetch(`${serverUrl}/api/profiles/${profileId}/endpoints`);
        if (epsResponse.ok) {
            const serverEps = await epsResponse.json();
            for (const ep of serverEps) {
                const localEps = db.getEndpoints(profileId);
                if (!localEps.find(e => e.id === ep.id)) {
                    db.createEndpoint(profileId, ep);
                }
            }
        }
        
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function startAutoSync(intervalMs = 30000) {
    if (syncInterval) {
        clearInterval(syncInterval);
    }
    
    // Initial check
    checkOnline().then(() => {
        if (isOnline) processSyncQueue();
    });
    
    // Periodic sync
    syncInterval = setInterval(async () => {
        await checkOnline();
        if (isOnline) {
            await processSyncQueue();
        }
    }, intervalMs);
}

function stopAutoSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
    }
}

function forceSync() {
    return checkOnline().then(() => {
        if (isOnline) {
            return processSyncQueue();
        }
        return Promise.resolve();
    });
}

module.exports = {
    setServerUrl,
    setStatusCallback,
    checkOnline,
    isOnline: () => isOnline,
    startAutoSync,
    stopAutoSync,
    forceSync,
    pullFromServer
};
