/** Signature Management Component */
function SignatureManager() {
    return {
        viewMode: localStorage.getItem('signature_view_mode') || 'table',
        certificates: [],
        selectedDocuments: new Set(),
        signingInProgress: false,
        signingResults: [],
        verifyResult: null,
        verifyDocumentId: '',
        signatureConfig: {
            type: 'QES',
            format: 'PADES',
            level: 'T'
        },
        providers: [
            { value: 'mock', label: 'Mock Provider (test)', description: 'Dostawca testowy - symuluje podpis' },
            { value: 'mszafir', label: 'mSzafir (KIR)', description: 'Podpis kwalifikowany - od 299 zł/rok' },
            { value: 'simplysign', label: 'SimplySign (Asseco)', description: 'Popularny w administracji' },
            { value: 'mobywatel', label: 'mObywatel', description: 'Bezpłatny - 5 podpisów/miesiąc' }
        ],
        currentProvider: 'mock',
        
        init() {
            // Check if documents were passed from documents view
            if (window.signatureManager && window.signatureManager.selectedDocuments) {
                this.selectedDocuments = window.signatureManager.selectedDocuments;
                window.signatureManager = null;
            }
            this.loadCertificates();
        },
        
        async loadCertificates() {
            try {
                const profileId = window.appInstance?.profileId || localStorage.getItem('exef_profile') || 'default';
                const response = await fetch(`/api/profiles/${profileId}/signature/certificates`);
                const data = await response.json();
                this.certificates = data.certificates || [];
            } catch (error) {
                console.error('Failed to load certificates:', error);
                this.showToast('Błąd ładowania certyfikatów');
            }
        },
        
        async signDocuments() {
            if (this.selectedDocuments.size === 0) {
                this.showToast('Wybierz dokumenty do podpisu');
                return;
            }
            
            this.signingInProgress = true;
            this.signingResults = [];
            
            try {
                const profileId = window.appInstance?.profileId || localStorage.getItem('exef_profile') || 'default';
                const response = await fetch(`/api/profiles/${profileId}/signature/sign`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        document_ids: Array.from(this.selectedDocuments),
                        signature_type: this.signatureConfig.type,
                        signature_format: this.signatureConfig.format,
                        signature_level: this.signatureConfig.level
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    this.showToast(`Pomyślnie podpisano ${result.signed} z ${result.total} dokumentów`);
                    
                    // Odśwież listę dokumentów
                    window.dispatchEvent(new CustomEvent('refreshDocuments'));
                    
                    // Pokaż wyniki
                    this.signingResults = result.results;
                } else {
                    this.showToast('Błąd podpisywania dokumentów');
                }
            } catch (error) {
                console.error('Signing failed:', error);
                this.showToast('Błąd podpisywania');
            } finally {
                this.signingInProgress = false;
            }
        },
        
        async verifySignature(documentId) {
            try {
                const profileId = window.appInstance?.profileId || localStorage.getItem('exef_profile') || 'default';
                const response = await fetch(`/api/profiles/${profileId}/signature/verify`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ document_id: documentId })
                });
                
                this.verifyResult = await response.json();
            } catch (error) {
                console.error('Verification failed:', error);
                this.showToast('Błąd weryfikacji');
            }
        },
        
        async addTimestamp(documentId) {
            try {
                const profileId = window.appInstance?.profileId || localStorage.getItem('exef_profile') || 'default';
                const response = await fetch(`/api/profiles/${profileId}/signature/timestamp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ document_id: documentId })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    this.showToast('Dodano znacznik czasu');
                    window.dispatchEvent(new CustomEvent('refreshDocuments'));
                } else {
                    this.showToast('Błąd dodawania znacznika czasu');
                }
            } catch (error) {
                console.error('Timestamp failed:', error);
                this.showToast('Błąd dodawania znacznika czasu');
            }
        },
        
        getSignatureTypeLabel(type) {
            const labels = {
                'QES': 'Podpis kwalifikowany (osoba)',
                'QSEAL': 'Pieczęć kwalifikowana (firma)',
                'ADVANCED': 'Podpis zaawansowany'
            };
            return labels[type] || type;
        },
        
        getSignatureFormatLabel(format) {
            const labels = {
                'PADES': 'PAdES (PDF)',
                'XADES': 'XAdES (XML)',
                'CADES': 'CAdES (CMS)'
            };
            return labels[format] || format;
        },
        
        getSignatureLevelLabel(level) {
            const labels = {
                'B': 'Basic',
                'T': 'Timestamp',
                'LT': 'Long-Term',
                'LTA': 'Long-Term Archival'
            };
            return labels[level] || level;
        },
        
        showToast(message) {
            window.dispatchEvent(new CustomEvent('toast', { detail: message }));
        }
    };
}
