import React, { useState, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// EXEF - Frontend Application
// UX: Bez modali - wszystko w prawej kolumnie
// ═══════════════════════════════════════════════════════════════════════════════

const API_URL = 'http://localhost:8003/api/v1';

// Kolory i style
const COLORS = {
  bg: '#0a0a0f',
  bgSecondary: '#111116',
  bgTertiary: '#1a1a22',
  border: 'rgba(255,255,255,0.08)',
  borderHover: 'rgba(255,255,255,0.15)',
  text: '#e4e4e7',
  textMuted: '#71717a',
  primary: '#3b82f6',
  secondary: '#8b5cf6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',
};

const STATUS_CONFIG = {
  new: { label: 'Nowy', color: COLORS.warning, icon: '🕐' },
  described: { label: 'Opisany', color: COLORS.primary, icon: '📝' },
  approved: { label: 'Zatwierdzony', color: COLORS.success, icon: '✅' },
  exported: { label: 'Wyeksportowany', color: COLORS.textMuted, icon: '📤' },
};

const TASK_STATUS = {
  pending: { label: 'Oczekuje', color: COLORS.warning, icon: '⏳' },
  in_progress: { label: 'W trakcie', color: COLORS.primary, icon: '🔄' },
  completed: { label: 'Zakończone', color: COLORS.success, icon: '✅' },
};

const ENTITY_TYPES = {
  jdg: { label: 'JDG', icon: '👤' },
  malzenstwo: { label: 'Małżeństwo', icon: '💑' },
  spolka: { label: 'Spółka', icon: '🏢' },
  organizacja: { label: 'Organizacja', icon: '🏛️' },
};

const PROJECT_TYPES = {
  ksiegowosc: { label: 'Księgowość', icon: '📊' },
  jpk: { label: 'JPK', icon: '📋' },
  zus: { label: 'ZUS', icon: '🏥' },
  vat_ue: { label: 'VAT-UE', icon: '🇪🇺' },
  projekt_klienta: { label: 'Projekt klienta', icon: '🏢' },
  rd_ipbox: { label: 'R&D / IP Box', icon: '🔬' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function App() {
  // Auth state
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [identity, setIdentity] = useState(null);
  
  // Data state
  const [entities, setEntities] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [documents, setDocuments] = useState([]);
  
  // UI state
  const [activeEntity, setActiveEntity] = useState(null);
  const [activeProject, setActiveProject] = useState(null);
  const [activeTask, setActiveTask] = useState(null);
  const [selectedDocument, setSelectedDocument] = useState(null);
  
  // Right panel state - zamiast modali
  const [rightPanel, setRightPanel] = useState(null); // 'entity' | 'project' | 'task' | 'document' | 'auth' | null
  const [rightPanelData, setRightPanelData] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // API helpers
  const api = async (endpoint, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
    };
    
    const res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: { ...headers, ...options.headers },
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Błąd serwera' }));
      throw new Error(err.detail || 'Błąd');
    }
    
    return res.json();
  };

  // Load initial data
  useEffect(() => {
    if (token) {
      loadIdentity();
      loadEntities();
    }
  }, [token]);

  useEffect(() => {
    if (activeEntity) {
      loadProjects();
    }
  }, [activeEntity]);

  useEffect(() => {
    if (activeProject) {
      loadTasks();
    }
  }, [activeProject]);

  useEffect(() => {
    if (activeTask) {
      loadDocuments();
    }
  }, [activeTask]);

  const loadIdentity = async () => {
    try {
      const data = await api('/auth/me');
      setIdentity(data);
    } catch (e) {
      setToken(null);
      localStorage.removeItem('token');
    }
  };

  const loadEntities = async () => {
    try {
      const data = await api('/entities');
      setEntities(data);
      if (data.length > 0 && !activeEntity) {
        setActiveEntity(data[0]);
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const loadProjects = async () => {
    if (!activeEntity) return;
    try {
      const data = await api(`/projects?entity_id=${activeEntity.id}`);
      setProjects(data);
      if (data.length > 0 && !activeProject) {
        setActiveProject(data[0]);
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const loadTasks = async () => {
    if (!activeProject) return;
    try {
      const data = await api(`/projects/${activeProject.id}/tasks`);
      setTasks(data);
      if (data.length > 0 && !activeTask) {
        setActiveTask(data[0]);
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const loadDocuments = async () => {
    if (!activeTask) return;
    try {
      const data = await api(`/tasks/${activeTask.id}/documents`);
      setDocuments(data);
    } catch (e) {
      setError(e.message);
    }
  };

  // Auth handlers
  const handleLogin = async (email, password) => {
    setLoading(true);
    try {
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);
      
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      });
      
      if (!res.ok) throw new Error('Nieprawidłowy email lub hasło');
      
      const data = await res.json();
      setToken(data.access_token);
      localStorage.setItem('token', data.access_token);
      setRightPanel(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (formData) => {
    setLoading(true);
    try {
      await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      await handleLogin(formData.email, formData.password);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setIdentity(null);
    localStorage.removeItem('token');
    setEntities([]);
    setProjects([]);
    setTasks([]);
    setDocuments([]);
  };

  // Entity handlers
  const handleCreateEntity = async (formData) => {
    setLoading(true);
    try {
      const entity = await api('/entities', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      setEntities([...entities, entity]);
      setActiveEntity(entity);
      setRightPanel(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Project handlers
  const handleCreateProject = async (formData) => {
    setLoading(true);
    try {
      const project = await api('/projects', {
        method: 'POST',
        body: JSON.stringify({ ...formData, entity_id: activeEntity.id }),
      });
      setProjects([...projects, project]);
      setActiveProject(project);
      setRightPanel(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Task handlers
  const handleCreateTask = async (formData) => {
    setLoading(true);
    try {
      const task = await api('/tasks', {
        method: 'POST',
        body: JSON.stringify({ ...formData, project_id: activeProject.id }),
      });
      setTasks([...tasks, task]);
      setActiveTask(task);
      setRightPanel(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Document handlers
  const handleCreateDocument = async (formData) => {
    setLoading(true);
    try {
      const doc = await api('/documents', {
        method: 'POST',
        body: JSON.stringify({ ...formData, task_id: activeTask.id }),
      });
      setDocuments([...documents, doc]);
      setSelectedDocument(doc);
      setRightPanel('document');
      setRightPanelData(doc);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateDocumentMetadata = async (docId, metadata) => {
    setLoading(true);
    try {
      const updated = await api(`/documents/${docId}/metadata`, {
        method: 'PATCH',
        body: JSON.stringify(metadata),
      });
      setDocuments(documents.map(d => d.id === docId ? updated : d));
      setSelectedDocument(updated);
      setRightPanelData(updated);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════════
  // AUTH SCREEN (gdy brak tokenu)
  // ═══════════════════════════════════════════════════════════════════════════════

  if (!token) {
    return (
      <div style={{
        minHeight: '100vh',
        background: `linear-gradient(135deg, ${COLORS.bg} 0%, #1a1333 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Inter', -apple-system, sans-serif",
        color: COLORS.text,
      }}>
        <AuthPanel 
          onLogin={handleLogin} 
          onRegister={handleRegister}
          loading={loading}
          error={error}
          onClearError={() => setError(null)}
        />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // MAIN APP LAYOUT
  // ═══════════════════════════════════════════════════════════════════════════════

  return (
    <div style={{
      minHeight: '100vh',
      background: COLORS.bg,
      fontFamily: "'Inter', -apple-system, sans-serif",
      color: COLORS.text,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* HEADER */}
      <header style={{
        height: '56px',
        background: COLORS.bgSecondary,
        borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{
            fontSize: '20px',
            fontWeight: '800',
            background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            EXEF
          </span>
          
          {/* Entity selector */}
          {entities.length > 0 && (
            <select
              value={activeEntity?.id || ''}
              onChange={(e) => {
                const entity = entities.find(en => en.id === e.target.value);
                setActiveEntity(entity);
                setActiveProject(null);
                setActiveTask(null);
              }}
              style={{
                background: COLORS.bgTertiary,
                border: `1px solid ${COLORS.border}`,
                borderRadius: '8px',
                padding: '8px 12px',
                color: COLORS.text,
                fontSize: '13px',
              }}
            >
              {entities.map(e => (
                <option key={e.id} value={e.id}>
                  {ENTITY_TYPES[e.type]?.icon} {e.name}
                </option>
              ))}
            </select>
          )}
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: COLORS.textMuted }}>
            {identity?.email}
          </span>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 12px',
              background: 'transparent',
              border: `1px solid ${COLORS.border}`,
              borderRadius: '6px',
              color: COLORS.textMuted,
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Wyloguj
          </button>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* LEFT SIDEBAR - Projekty i Zadania */}
        <aside style={{
          width: '260px',
          background: COLORS.bgSecondary,
          borderRight: `1px solid ${COLORS.border}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Podmiot section */}
          <div style={{ padding: '12px', borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '8px',
            }}>
              <span style={{ fontSize: '10px', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>
                Podmiot
              </span>
              <button
                onClick={() => { setRightPanel('entity'); setRightPanelData(null); }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: COLORS.primary,
                  cursor: 'pointer',
                  fontSize: '16px',
                  padding: '2px 6px',
                }}
              >
                +
              </button>
            </div>
            {activeEntity && (
              <div style={{
                padding: '10px',
                background: COLORS.bgTertiary,
                borderRadius: '8px',
                cursor: 'pointer',
              }}
              onClick={() => { setRightPanel('entity'); setRightPanelData(activeEntity); }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '20px' }}>{ENTITY_TYPES[activeEntity.type]?.icon}</span>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '500' }}>{activeEntity.name}</div>
                    <div style={{ fontSize: '10px', color: COLORS.textMuted }}>
                      NIP: {activeEntity.nip || 'brak'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Projekty section */}
          <div style={{ padding: '12px', borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '8px',
            }}>
              <span style={{ fontSize: '10px', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>
                Projekty
              </span>
              <button
                onClick={() => { setRightPanel('project'); setRightPanelData(null); }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: COLORS.primary,
                  cursor: 'pointer',
                  fontSize: '16px',
                  padding: '2px 6px',
                }}
                disabled={!activeEntity}
              >
                +
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {projects.map(project => (
                <button
                  key={project.id}
                  onClick={() => { setActiveProject(project); setActiveTask(null); }}
                  style={{
                    padding: '10px',
                    background: activeProject?.id === project.id ? COLORS.bgTertiary : 'transparent',
                    border: activeProject?.id === project.id ? `1px solid ${COLORS.border}` : '1px solid transparent',
                    borderRadius: '8px',
                    color: COLORS.text,
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <span>{PROJECT_TYPES[project.type]?.icon || '📁'}</span>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {project.name}
                    </div>
                    {project.year && (
                      <div style={{ fontSize: '10px', color: COLORS.textMuted }}>{project.year}</div>
                    )}
                  </div>
                </button>
              ))}
              {projects.length === 0 && (
                <div style={{ padding: '10px', color: COLORS.textMuted, fontSize: '12px', textAlign: 'center' }}>
                  Brak projektów
                </div>
              )}
            </div>
          </div>

          {/* Zadania section */}
          <div style={{ flex: 1, padding: '12px', overflow: 'auto' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '8px',
            }}>
              <span style={{ fontSize: '10px', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>
                Zadania
              </span>
              <button
                onClick={() => { setRightPanel('task'); setRightPanelData(null); }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: COLORS.primary,
                  cursor: 'pointer',
                  fontSize: '16px',
                  padding: '2px 6px',
                }}
                disabled={!activeProject}
              >
                +
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {tasks.map(task => {
                const progress = task.docs_total > 0 ? Math.round((task.docs_described / task.docs_total) * 100) : 0;
                const status = TASK_STATUS[task.status];
                
                return (
                  <button
                    key={task.id}
                    onClick={() => setActiveTask(task)}
                    style={{
                      padding: '10px',
                      background: activeTask?.id === task.id ? COLORS.bgTertiary : 'transparent',
                      border: activeTask?.id === task.id ? `1px solid ${COLORS.border}` : '1px solid transparent',
                      borderRadius: '8px',
                      color: COLORS.text,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '500' }}>{task.icon} {task.name}</span>
                      <span style={{ fontSize: '10px', color: status?.color }}>{status?.icon}</span>
                    </div>
                    <div style={{
                      height: '3px',
                      background: COLORS.border,
                      borderRadius: '2px',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${progress}%`,
                        height: '100%',
                        background: progress === 100 ? COLORS.success : COLORS.primary,
                      }} />
                    </div>
                    <div style={{ fontSize: '10px', color: COLORS.textMuted, marginTop: '4px' }}>
                      {task.docs_described}/{task.docs_total} opisanych
                    </div>
                  </button>
                );
              })}
              {tasks.length === 0 && activeProject && (
                <div style={{ padding: '10px', color: COLORS.textMuted, fontSize: '12px', textAlign: 'center' }}>
                  Brak zadań
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT - Dokumenty */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Toolbar */}
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                {activeTask ? `${activeTask.icon} ${activeTask.name}` : 'Wybierz zadanie'}
              </h2>
              {activeTask?.period_start && (
                <div style={{ fontSize: '12px', color: COLORS.textMuted }}>
                  {activeTask.period_start} — {activeTask.period_end}
                </div>
              )}
            </div>
            <button
              onClick={() => { setRightPanel('document'); setRightPanelData(null); }}
              disabled={!activeTask}
              style={{
                padding: '8px 14px',
                background: activeTask ? COLORS.primary : COLORS.bgTertiary,
                border: 'none',
                borderRadius: '8px',
                color: activeTask ? '#fff' : COLORS.textMuted,
                cursor: activeTask ? 'pointer' : 'not-allowed',
                fontSize: '13px',
                fontWeight: '500',
              }}
            >
              + Dodaj dokument
            </button>
          </div>

          {/* Documents list */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
            {documents.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: '10px', color: COLORS.textMuted, fontWeight: '500', textTransform: 'uppercase' }}>Numer</th>
                    <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: '10px', color: COLORS.textMuted, fontWeight: '500', textTransform: 'uppercase' }}>Kontrahent</th>
                    <th style={{ padding: '10px 8px', textAlign: 'right', fontSize: '10px', color: COLORS.textMuted, fontWeight: '500', textTransform: 'uppercase' }}>Kwota</th>
                    <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: '10px', color: COLORS.textMuted, fontWeight: '500', textTransform: 'uppercase' }}>Kategoria</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '10px', color: COLORS.textMuted, fontWeight: '500', textTransform: 'uppercase' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map(doc => {
                    const status = STATUS_CONFIG[doc.status];
                    return (
                      <tr
                        key={doc.id}
                        onClick={() => { setSelectedDocument(doc); setRightPanel('document'); setRightPanelData(doc); }}
                        style={{
                          borderBottom: `1px solid ${COLORS.border}`,
                          cursor: 'pointer',
                          background: selectedDocument?.id === doc.id ? COLORS.bgTertiary : 'transparent',
                        }}
                      >
                        <td style={{ padding: '12px 8px' }}>
                          <div style={{ fontSize: '13px', fontWeight: '500' }}>{doc.number || '—'}</div>
                          <div style={{ fontSize: '10px', color: COLORS.textMuted }}>{doc.document_date}</div>
                        </td>
                        <td style={{ padding: '12px 8px' }}>
                          <div style={{ fontSize: '13px' }}>{doc.contractor_name || '—'}</div>
                          <div style={{ fontSize: '10px', color: COLORS.textMuted }}>
                            {doc.contractor_nip ? `NIP: ${doc.contractor_nip}` : ''}
                          </div>
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                          <div style={{ fontSize: '14px', fontWeight: '600' }}>
                            {doc.amount_gross?.toLocaleString('pl-PL') || '—'} {doc.currency}
                          </div>
                        </td>
                        <td style={{ padding: '12px 8px' }}>
                          {doc.metadata?.category ? (
                            <span style={{
                              fontSize: '11px',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              background: `${COLORS.primary}20`,
                              color: COLORS.primary,
                            }}>
                              {doc.metadata.category}
                            </span>
                          ) : (
                            <span style={{ color: COLORS.warning, fontSize: '11px' }}>⚠️ Brak</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                          <span style={{
                            fontSize: '11px',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            background: `${status?.color}20`,
                            color: status?.color,
                          }}>
                            {status?.icon} {status?.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: COLORS.textMuted,
              }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
                <div style={{ fontSize: '14px' }}>
                  {activeTask ? 'Brak dokumentów' : 'Wybierz zadanie z listy'}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* RIGHT PANEL - zamiast modali */}
        {rightPanel && (
          <aside style={{
            width: '380px',
            background: COLORS.bgSecondary,
            borderLeft: `1px solid ${COLORS.border}`,
            display: 'flex',
            flexDirection: 'column',
          }}>
            <RightPanel
              type={rightPanel}
              data={rightPanelData}
              onClose={() => { setRightPanel(null); setRightPanelData(null); }}
              onCreateEntity={handleCreateEntity}
              onCreateProject={handleCreateProject}
              onCreateTask={handleCreateTask}
              onCreateDocument={handleCreateDocument}
              onUpdateDocumentMetadata={handleUpdateDocumentMetadata}
              loading={loading}
              activeEntity={activeEntity}
              activeProject={activeProject}
              activeTask={activeTask}
            />
          </aside>
        )}
      </div>

      {/* Error toast */}
      {error && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          padding: '12px 20px',
          background: COLORS.danger,
          borderRadius: '8px',
          color: '#fff',
          fontSize: '13px',
          cursor: 'pointer',
        }}
        onClick={() => setError(null)}
        >
          {error}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH PANEL
// ═══════════════════════════════════════════════════════════════════════════════

function AuthPanel({ onLogin, onRegister, loading, error, onClearError }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [isCodeSent, setIsCodeSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    
    if (!isCodeSent) {
      // Request magic link
      try {
        const response = await fetch(`${API_URL}/auth/magic-link/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        
        if (response.ok) {
          setIsCodeSent(true);
          setMessage('Link logowania został wysłany na adres email. Sprawdź swoją skrzynkę.');
        } else {
          const error = await response.json();
          setMessage('Wystąpił błąd. Spróbuj ponownie.');
        }
      } catch (err) {
        setMessage('Wystąpił błąd połączenia. Spróbuj ponownie.');
      }
    } else {
      // Login with code
      try {
        const response = await fetch(`${API_URL}/auth/magic-link/login-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code }),
        });
        
        if (response.ok) {
          const tokenData = await response.json();
          localStorage.setItem('token', tokenData.access_token);
          window.location.reload();
        } else {
          const error = await response.json();
          setMessage('Nieprawidłowy kod. Spróbuj ponownie.');
        }
      } catch (err) {
        setMessage('Wystąpił błąd połączenia. Spróbuj ponownie.');
      }
    }
  };

  return (
    <div style={{
      width: '400px',
      background: COLORS.bgSecondary,
      borderRadius: '16px',
      padding: '32px',
      border: `1px solid ${COLORS.border}`,
    }}>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{
          fontSize: '28px',
          fontWeight: '800',
          background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '8px',
        }}>
          EXEF
        </div>
        <div style={{ color: COLORS.textMuted, fontSize: '13px' }}>
          Document Flow Engine
        </div>
        <div style={{ color: COLORS.text, fontSize: '14px', marginTop: '12px' }}>
          {!isCodeSent ? 'Wpisz email, aby otrzymać link logowania' : 'Wpisz kod z emaila'}
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isCodeSent}
          style={{
            width: '100%',
            padding: '12px',
            marginBottom: '12px',
            background: COLORS.bgTertiary,
            border: `1px solid ${COLORS.border}`,
            borderRadius: '8px',
            color: COLORS.text,
            fontSize: '14px',
            boxSizing: 'border-box',
            opacity: isCodeSent ? 0.6 : 1,
          }}
        />
        
        {isCodeSent && (
          <input
            type="text"
            placeholder="Kod jednorazowy"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required
            maxLength={8}
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '20px',
              background: COLORS.bgTertiary,
              border: `1px solid ${COLORS.border}`,
              borderRadius: '8px',
              color: COLORS.text,
              fontSize: '14px',
              fontWeight: 'bold',
              letterSpacing: '2px',
              textAlign: 'center',
              boxSizing: 'border-box',
            }}
          />
        )}

        {message && (
          <div style={{
            padding: '12px',
            marginBottom: '16px',
            background: isCodeSent ? `${COLORS.success}20` : `${COLORS.warning}20`,
            border: `1px solid ${isCodeSent ? COLORS.success : COLORS.warning}40`,
            borderRadius: '8px',
            color: isCodeSent ? COLORS.success : COLORS.warning,
            fontSize: '13px',
            textAlign: 'center',
          }}>
            {message}
          </div>
        )}

        {error && (
          <div style={{
            padding: '12px',
            marginBottom: '16px',
            background: `${COLORS.danger}20`,
            border: `1px solid ${COLORS.danger}40`,
            borderRadius: '8px',
            color: COLORS.danger,
            fontSize: '13px',
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || (!email && !isCodeSent) || (isCodeSent && !code)}
          style={{
            width: '100%',
            padding: '14px',
            background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '600',
            cursor: (loading || (!email && !isCodeSent) || (isCodeSent && !code)) ? 'wait' : 'pointer',
            opacity: (loading || (!email && !isCodeSent) || (isCodeSent && !code)) ? 0.7 : 1,
          }}
        >
          {loading ? '...' : !isCodeSent ? 'Wyślij link logowania' : 'Zaloguj'}
        </button>
        
        {isCodeSent && (
          <div style={{ 
            marginTop: '16px', 
            textAlign: 'center',
            fontSize: '12px',
            color: COLORS.textMuted 
          }}>
            Sprawdź email i wpisz kod jednorazowy.<br/>
            Możesz też kliknąć link w emailu.
          </div>
        )}
      </form>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RIGHT PANEL - Formularze
// ═══════════════════════════════════════════════════════════════════════════════

function RightPanel({ 
  type, data, onClose, 
  onCreateEntity, onCreateProject, onCreateTask, onCreateDocument, onUpdateDocumentMetadata,
  loading, activeEntity, activeProject, activeTask 
}) {
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (data) {
      setFormData(data);
    } else {
      setFormData({});
    }
  }, [data, type]);

  const update = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    switch (type) {
      case 'entity':
        if (data) {
          // Update - TODO
        } else {
          onCreateEntity(formData);
        }
        break;
      case 'project':
        onCreateProject(formData);
        break;
      case 'task':
        onCreateTask(formData);
        break;
      case 'document':
        if (data) {
          onUpdateDocumentMetadata(data.id, {
            category: formData.category,
            description: formData.description,
            tags: formData.tags,
          });
        } else {
          onCreateDocument(formData);
        }
        break;
    }
  };

  const titles = {
    entity: data ? 'Edytuj podmiot' : 'Nowy podmiot',
    project: data ? 'Edytuj projekt' : 'Nowy projekt',
    task: data ? 'Edytuj zadanie' : 'Nowe zadanie',
    document: data ? 'Edytuj dokument' : 'Nowy dokument',
  };

  return (
    <>
      <div style={{
        padding: '16px',
        borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600' }}>{titles[type]}</h3>
        <button
          onClick={onClose}
          style={{
            background: COLORS.bgTertiary,
            border: 'none',
            borderRadius: '6px',
            color: COLORS.textMuted,
            cursor: 'pointer',
            width: '28px',
            height: '28px',
            fontSize: '14px',
          }}
        >
          ×
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {/* ENTITY FORM */}
        {type === 'entity' && (
          <>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: COLORS.textMuted, marginBottom: '6px' }}>Typ podmiotu</label>
              <select
                value={formData.type || 'jdg'}
                onChange={(e) => update('type', e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: COLORS.bgTertiary,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '8px',
                  color: COLORS.text,
                  fontSize: '13px',
                }}
              >
                {Object.entries(ENTITY_TYPES).map(([key, val]) => (
                  <option key={key} value={key}>{val.icon} {val.label}</option>
                ))}
              </select>
            </div>
            <InputField label="Nazwa" value={formData.name || ''} onChange={(v) => update('name', v)} required />
            <InputField label="NIP" value={formData.nip || ''} onChange={(v) => update('nip', v)} placeholder="10 cyfr" />
            <InputField label="Ulica" value={formData.address_street || ''} onChange={(v) => update('address_street', v)} />
            <InputField label="Miasto" value={formData.address_city || ''} onChange={(v) => update('address_city', v)} />
            <InputField label="Kod pocztowy" value={formData.address_postal || ''} onChange={(v) => update('address_postal', v)} />
          </>
        )}

        {/* PROJECT FORM */}
        {type === 'project' && (
          <>
            <InputField label="Nazwa projektu" value={formData.name || ''} onChange={(v) => update('name', v)} required />
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: COLORS.textMuted, marginBottom: '6px' }}>Typ projektu</label>
              <select
                value={formData.type || 'ksiegowosc'}
                onChange={(e) => update('type', e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: COLORS.bgTertiary,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '8px',
                  color: COLORS.text,
                  fontSize: '13px',
                }}
              >
                {Object.entries(PROJECT_TYPES).map(([key, val]) => (
                  <option key={key} value={key}>{val.icon} {val.label}</option>
                ))}
              </select>
            </div>
            <InputField label="Rok" value={formData.year || ''} onChange={(v) => update('year', parseInt(v) || null)} type="number" />
            <InputField label="Początek okresu" value={formData.period_start || ''} onChange={(v) => update('period_start', v)} type="date" />
            <InputField label="Koniec okresu" value={formData.period_end || ''} onChange={(v) => update('period_end', v)} type="date" />
          </>
        )}

        {/* TASK FORM */}
        {type === 'task' && (
          <>
            <InputField label="Nazwa zadania" value={formData.name || ''} onChange={(v) => update('name', v)} required />
            <InputField label="Ikona" value={formData.icon || '📋'} onChange={(v) => update('icon', v)} />
            <InputField label="Początek okresu" value={formData.period_start || ''} onChange={(v) => update('period_start', v)} type="date" />
            <InputField label="Koniec okresu" value={formData.period_end || ''} onChange={(v) => update('period_end', v)} type="date" />
            <InputField label="Deadline" value={formData.deadline || ''} onChange={(v) => update('deadline', v)} type="date" />
          </>
        )}

        {/* DOCUMENT FORM */}
        {type === 'document' && (
          <>
            {data ? (
              <>
                {/* Dane z importu - read only */}
                <div style={{
                  padding: '12px',
                  background: COLORS.bgTertiary,
                  borderRadius: '8px',
                  marginBottom: '16px',
                }}>
                  <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>
                    Dane zaimportowane
                  </div>
                  <InfoRow label="Numer" value={data.number} />
                  <InfoRow label="Kontrahent" value={data.contractor_name} />
                  <InfoRow label="NIP" value={data.contractor_nip} />
                  <InfoRow label="Kwota brutto" value={`${data.amount_gross?.toLocaleString('pl-PL')} ${data.currency}`} />
                  <InfoRow label="Data" value={data.document_date} />
                </div>
                
                {/* Metadane - edytowalne */}
                <div style={{ fontSize: '10px', color: COLORS.primary, marginBottom: '12px', textTransform: 'uppercase' }}>
                  Metadane (edytowalne)
                </div>
                <InputField 
                  label="Kategoria" 
                  value={formData.metadata?.category || formData.category || ''} 
                  onChange={(v) => update('category', v)} 
                  placeholder="np. IT - Hosting"
                />
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: COLORS.textMuted, marginBottom: '6px' }}>Opis</label>
                  <textarea
                    value={formData.metadata?.description || formData.description || ''}
                    onChange={(e) => update('description', e.target.value)}
                    placeholder="Dodaj opis..."
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: COLORS.bgTertiary,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: '8px',
                      color: COLORS.text,
                      fontSize: '13px',
                      minHeight: '80px',
                      resize: 'vertical',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                {/* Nowy dokument */}
                <InputField label="Numer dokumentu" value={formData.number || ''} onChange={(v) => update('number', v)} />
                <InputField label="Kontrahent" value={formData.contractor_name || ''} onChange={(v) => update('contractor_name', v)} />
                <InputField label="NIP kontrahenta" value={formData.contractor_nip || ''} onChange={(v) => update('contractor_nip', v)} />
                <InputField label="Kwota netto" value={formData.amount_net || ''} onChange={(v) => update('amount_net', parseFloat(v) || null)} type="number" />
                <InputField label="VAT" value={formData.amount_vat || ''} onChange={(v) => update('amount_vat', parseFloat(v) || null)} type="number" />
                <InputField label="Kwota brutto" value={formData.amount_gross || ''} onChange={(v) => update('amount_gross', parseFloat(v) || null)} type="number" />
                <InputField label="Data dokumentu" value={formData.document_date || ''} onChange={(v) => update('document_date', v)} type="date" />
              </>
            )}
          </>
        )}
      </form>

      <div style={{
        padding: '16px',
        borderTop: `1px solid ${COLORS.border}`,
      }}>
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '500',
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? '...' : data ? 'Zapisz' : 'Utwórz'}
        </button>
      </div>
    </>
  );
}

function InputField({ label, value, onChange, type = 'text', required = false, placeholder = '' }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ display: 'block', fontSize: '12px', color: COLORS.textMuted, marginBottom: '6px' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '12px',
          background: COLORS.bgTertiary,
          border: `1px solid ${COLORS.border}`,
          borderRadius: '8px',
          color: COLORS.text,
          fontSize: '13px',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12px' }}>
      <span style={{ color: COLORS.textMuted }}>{label}</span>
      <span style={{ fontWeight: '500' }}>{value || '—'}</span>
    </div>
  );
}
