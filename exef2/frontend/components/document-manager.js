/** Document Management Component - Standardized View Pattern */
function DocumentManager() {
    return {
        viewMode: localStorage.getItem('documents_view_mode') || 'table',
        documents: [],
        editingDocument: null,
        selectedDocuments: new Set(),
        filters: {
            status: '',
            type: '',
            search: ''
        },
        
        init() {
            this.loadDocuments();
        },
        
        toggleView(mode) {
            this.viewMode = mode;
            localStorage.setItem('documents_view_mode', mode);
        },
        
        async loadDocuments() {
            try {
                const params = new URLSearchParams();
                if (this.filters.status) params.append('status', this.filters.status);
                if (this.filters.type) params.append('type', this.filters.type);
                
                const response = await fetch(`/api/profiles/${window.appInstance.profileId}/documents?${params}`);
                this.documents = await response.json();
            } catch (error) {
                console.error('Failed to load documents:', error);
            }
        },
        
        startEditDocument(document) {
            this.editingDocument = { ...document };
        },
        
        cancelEditDocument() {
            this.editingDocument = null;
        },
        
        async saveDocument() {
            if (!this.editingDocument) return;
            
            try {
                const response = await fetch(`/api/profiles/${window.appInstance.profileId}/documents/${this.editingDocument.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        number: this.editingDocument.number,
                        contractor: this.editingDocument.contractor,
                        amount: this.editingDocument.amount,
                        vat_rate: this.editingDocument.vat_rate
                    })
                });
                
                if (response.ok) {
                    const updated = await response.json();
                    const index = this.documents.findIndex(d => d.id === updated.id);
                    this.documents[index] = updated;
                    this.editingDocument = null;
                    this.showToast('Dokument zaktualizowany');
                }
            } catch (error) {
                console.error('Failed to update document:', error);
                this.showToast('Błąd aktualizacji dokumentu');
            }
        },
        
        async deleteDocument(documentId) {
            if (!confirm('Usunąć dokument?')) return;
            
            try {
                const response = await fetch(`/api/profiles/${window.appInstance.profileId}/documents/${documentId}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    this.documents = this.documents.filter(d => d.id !== documentId);
                    this.selectedDocuments.delete(documentId);
                    this.showToast('Dokument usunięty');
                }
            } catch (error) {
                console.error('Failed to delete document:', error);
                this.showToast('Błąd usuwania dokumentu');
            }
        },
        
        async updateDocumentStatus(documentId, status) {
            try {
                const response = await fetch(`/api/profiles/${window.appInstance.profileId}/documents/${documentId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status })
                });
                
                if (response.ok) {
                    const document = this.documents.find(d => d.id === documentId);
                    document.status = status;
                    this.showToast(`Status zmieniony na: ${status}`);
                }
            } catch (error) {
                console.error('Failed to update status:', error);
                this.showToast('Błąd zmiany statusu');
            }
        },
        
        toggleSelection(documentId) {
            if (this.selectedDocuments.has(documentId)) {
                this.selectedDocuments.delete(documentId);
            } else {
                this.selectedDocuments.add(documentId);
            }
        },
        
        selectAll() {
            if (this.selectedDocuments.size === this.documents.length) {
                this.selectedDocuments.clear();
            } else {
                this.documents.forEach(d => this.selectedDocuments.add(d.id));
            }
        },
        
        async bulkUpdateStatus(status) {
            if (!this.selectedDocuments.size) {
                this.showToast('Wybierz dokumenty');
                return;
            }
            
            try {
                const promises = Array.from(this.selectedDocuments).map(id =>
                    fetch(`/api/profiles/${window.appInstance.profileId}/documents/${id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status })
                    })
                );
                
                await Promise.all(promises);
                
                this.documents.forEach(d => {
                    if (this.selectedDocuments.has(d.id)) {
                        d.status = status;
                    }
                });
                
                this.selectedDocuments.clear();
                this.showToast(`Zaktualizowano ${promises.length} dokumentów`);
            } catch (error) {
                console.error('Failed to bulk update:', error);
                this.showToast('Błąd aktualizacji');
            }
        },
        
        filteredDocuments() {
            return this.documents.filter(doc => {
                if (this.filters.status && doc.status !== this.filters.status) return false;
                if (this.filters.type && doc.type !== this.filters.type) return false;
                if (this.filters.search) {
                    const search = this.filters.search.toLowerCase();
                    return doc.number.toLowerCase().includes(search) ||
                           doc.contractor.toLowerCase().includes(search);
                }
                return true;
            });
        },
        
        showToast(message) {
            window.dispatchEvent(new CustomEvent('toast', { detail: message }));
        }
    };
}
