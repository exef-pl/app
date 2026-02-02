/** Profile Management Component - Table and Card Views */
function ProfileManager() {
    return {
        viewMode: localStorage.getItem('profiles_view_mode') || 'cards',
        profiles: [],
        delegates: {},
        editingProfile: null,
        editingDelegate: null,
        expandedRows: new Set(),
        
        init() {
            this.loadProfiles();
        },
        
        toggleView(mode) {
            this.viewMode = mode;
            localStorage.setItem('profiles_view_mode', mode);
        },
        
        async loadProfiles() {
            try {
                const response = await fetch('/api/profiles');
                this.profiles = await response.json();
                
                // Load delegates for each profile
                for (const profile of this.profiles) {
                    const delegatesResponse = await fetch(`/api/profiles/${profile.id}/delegates`);
                    this.delegates[profile.id] = await delegatesResponse.json();
                }
            } catch (error) {
                console.error('Failed to load profiles:', error);
            }
        },
        
        toggleExpand(profileId) {
            if (this.expandedRows.has(profileId)) {
                this.expandedRows.delete(profileId);
            } else {
                this.expandedRows.add(profileId);
            }
        },
        
        startEditProfile(profile) {
            this.editingProfile = { ...profile };
        },
        
        cancelEditProfile() {
            this.editingProfile = null;
        },
        
        async saveProfile() {
            if (!this.editingProfile) return;
            
            try {
                const response = await fetch(`/api/profiles/${this.editingProfile.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: this.editingProfile.name,
                        nip: this.editingProfile.nip,
                        address: this.editingProfile.address,
                        color: this.editingProfile.color
                    })
                });
                
                if (response.ok) {
                    const updated = await response.json();
                    const index = this.profiles.findIndex(p => p.id === updated.id);
                    this.profiles[index] = updated;
                    this.editingProfile = null;
                    this.showToast('Profil zaktualizowany');
                }
            } catch (error) {
                console.error('Failed to update profile:', error);
                this.showToast('Błąd aktualizacji profilu');
            }
        },
        
        async createProfile() {
            const newProfile = {
                name: 'Nowa Firma',
                nip: '0000000000',
                address: '',
                color: '#' + Math.floor(Math.random()*16777215).toString(16)
            };
            
            try {
                const response = await fetch('/api/profiles', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newProfile)
                });
                
                if (response.ok) {
                    const created = await response.json();
                    this.profiles.push(created);
                    this.delegates[created.id] = [];
                    this.showToast('Profil utworzony');
                }
            } catch (error) {
                console.error('Failed to create profile:', error);
                this.showToast('Błąd tworzenia profilu');
            }
        },
        
        async deleteProfile(profileId) {
            if (profileId === 'default') {
                this.showToast('Nie można usunąć domyślnego profilu');
                return;
            }
            
            if (!confirm('Usunąć profil i wszystkie jego dane?')) return;
            
            try {
                const response = await fetch(`/api/profiles/${profileId}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    this.profiles = this.profiles.filter(p => p.id !== profileId);
                    delete this.delegates[profileId];
                    this.showToast('Profil usunięty');
                }
            } catch (error) {
                console.error('Failed to delete profile:', error);
                this.showToast('Błąd usuwania profilu');
            }
        },
        
        // Delegate management
        startEditDelegate(profileId, delegate = null) {
            this.editingDelegate = {
                profileId,
                delegate: delegate ? { ...delegate } : {
                    delegate_name: '',
                    delegate_email: '',
                    delegate_nip: '',
                    role: 'viewer'
                }
            };
        },
        
        cancelEditDelegate() {
            this.editingDelegate = null;
        },
        
        async saveDelegate() {
            if (!this.editingDelegate) return;
            
            const { profileId, delegate } = this.editingDelegate;
            const url = delegate.id 
                ? `/api/profiles/${profileId}/delegates/${delegate.id}`
                : `/api/profiles/${profileId}/delegates`;
            
            const method = delegate.id ? 'PATCH' : 'POST';
            
            try {
                const response = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(delegate)
                });
                
                if (response.ok) {
                    const saved = await response.json();
                    
                    if (delegate.id) {
                        const index = this.delegates[profileId].findIndex(d => d.id === saved.id);
                        this.delegates[profileId][index] = saved;
                    } else {
                        this.delegates[profileId].push(saved);
                    }
                    
                    this.editingDelegate = null;
                    this.showToast(delegate.id ? 'Uprawnienia zaktualizowane' : 'Osoba dodana');
                }
            } catch (error) {
                console.error('Failed to save delegate:', error);
                this.showToast('Błąd zapisu');
            }
        },
        
        async deleteDelegate(profileId, delegateId) {
            if (!confirm('Usunąć uprawnienia tej osoby?')) return;
            
            try {
                const response = await fetch(`/api/profiles/${profileId}/delegates/${delegateId}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    this.delegates[profileId] = this.delegates[profileId].filter(d => d.id !== delegateId);
                    this.showToast('Osoba usunięta');
                }
            } catch (error) {
                console.error('Failed to delete delegate:', error);
                this.showToast('Błąd usuwania');
            }
        },
        
        async toggleDelegateStatus(profileId, delegate) {
            await this.saveDelegateStatus(profileId, delegate.id, !delegate.active);
        },
        
        async saveDelegateStatus(profileId, delegateId, active) {
            try {
                const response = await fetch(`/api/profiles/${profileId}/delegates/${delegateId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ active })
                });
                
                if (response.ok) {
                    const delegate = this.delegates[profileId].find(d => d.id === delegateId);
                    delegate.active = active;
                    this.showToast(active ? 'Aktywowano' : 'Dezaktywowano');
                }
            } catch (error) {
                console.error('Failed to update delegate:', error);
                this.showToast('Błąd aktualizacji');
            }
        },
        
        showToast(message) {
            window.dispatchEvent(new CustomEvent('toast', { detail: message }));
        }
    };
}
