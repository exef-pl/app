import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams, useLocation, Link } from 'react-router-dom';
import AccountingFirmDashboard from './AccountingFirmDashboard.jsx';

// ═══════════════════════════════════════════════════════════════════════════════
// EXEF - Frontend Application
// URL-routed: każda akcja pod unikalnym adresem
// ═══════════════════════════════════════════════════════════════════════════════

const API_URL = 'http://localhost:8003/api/v1';

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
// AUTH CONTEXT
// ═══════════════════════════════════════════════════════════════════════════════

const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [identity, setIdentity] = useState(null);
  const [entities, setEntities] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const api = useCallback(async (endpoint, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
    };
    const res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: { ...headers, ...options.headers },
    });
    if (res.status === 401) {
      setToken(null);
      setIdentity(null);
      localStorage.removeItem('token');
      throw new Error('Sesja wygasła');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Błąd serwera' }));
      throw new Error(err.detail || 'Błąd');
    }
    return res.json();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    api('/auth/me').then(setIdentity).catch(() => { setToken(null); localStorage.removeItem('token'); });
    api('/entities').then(setEntities).catch(() => {});
  }, [token, api]);

  const login = (t) => { setToken(t); localStorage.setItem('token', t); };
  const logout = () => { setToken(null); setIdentity(null); setEntities([]); localStorage.removeItem('token'); };
  const refreshEntities = () => api('/entities').then(setEntities).catch(() => {});

  const ctx = { token, identity, api, login, logout, entities, setEntities, refreshEntities, error, setError, loading, setLoading };

  return (
    <AuthContext.Provider value={ctx}>
      <Routes>
        <Route path="/login" element={!token ? <LoginPage /> : <Navigate to="/" replace />} />
        <Route path="/*" element={token ? <AppShell /> : <Navigate to="/login" replace />} />
      </Routes>
      {error && (
        <div
          onClick={() => setError(null)}
          style={{
            position: 'fixed', bottom: 20, right: 20, padding: '12px 20px',
            background: COLORS.danger, borderRadius: 8, color: '#fff',
            fontSize: 13, cursor: 'pointer', zIndex: 1000,
          }}
        >
          {error}
        </div>
      )}
    </AuthContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP SHELL (authenticated layout with header + routes)
// ═══════════════════════════════════════════════════════════════════════════════

function AppShell() {
  const { identity, logout, entities } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isFirmView = location.pathname.startsWith('/biuro');
  const isMultiView = location.pathname === '/' || location.pathname === '/entity/new';

  return (
    <div style={{
      minHeight: '100vh', background: COLORS.bg,
      fontFamily: "'Inter', -apple-system, sans-serif",
      color: COLORS.text, display: 'flex', flexDirection: 'column',
    }}>
      {/* HEADER */}
      <header style={{
        height: '56px', background: COLORS.bgSecondary,
        borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <span style={{
              fontSize: '20px', fontWeight: '800',
              background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              EXEF
            </span>
          </Link>

          {/* View mode toggle */}
          <div style={{
            display: 'flex', background: COLORS.bgTertiary, borderRadius: '8px',
            border: `1px solid ${COLORS.border}`, overflow: 'hidden',
          }}>
            <button
              onClick={() => navigate('/biuro')}
              style={{
                padding: '7px 14px',
                background: isFirmView ? COLORS.secondary : 'transparent',
                border: 'none', color: isFirmView ? '#fff' : COLORS.textMuted,
                cursor: 'pointer', fontSize: '12px', fontWeight: '500',
                transition: 'all 0.15s',
              }}
            >
              🏢 Biuro
            </button>
            <button
              onClick={() => navigate('/')}
              style={{
                padding: '7px 14px',
                background: isMultiView ? COLORS.primary : 'transparent',
                border: 'none', color: isMultiView ? '#fff' : COLORS.textMuted,
                cursor: 'pointer', fontSize: '12px', fontWeight: '500',
                transition: 'all 0.15s',
              }}
            >
              📊 Księgowość
            </button>
            <button
              onClick={() => {
                if (entities.length > 0) navigate(`/entity/${entities[0].id}`);
              }}
              style={{
                padding: '7px 14px',
                background: (!isMultiView && !isFirmView) ? COLORS.primary : 'transparent',
                border: 'none', color: (!isMultiView && !isFirmView) ? '#fff' : COLORS.textMuted,
                cursor: 'pointer', fontSize: '12px', fontWeight: '500',
                transition: 'all 0.15s',
              }}
            >
              👤 Podmiot
            </button>
          </div>

          {/* Entity selector - only in single mode */}
          {!isMultiView && entities.length > 0 && (
            <select
              value={location.pathname.split('/')[2] || ''}
              onChange={(e) => navigate(`/entity/${e.target.value}`)}
              style={{
                background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
                borderRadius: '8px', padding: '8px 12px',
                color: COLORS.text, fontSize: '13px',
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
            onClick={() => { logout(); navigate('/login'); }}
            style={{
              padding: '8px 12px', background: 'transparent',
              border: `1px solid ${COLORS.border}`, borderRadius: '6px',
              color: COLORS.textMuted, cursor: 'pointer', fontSize: '12px',
            }}
          >
            Wyloguj
          </button>
        </div>
      </header>

      {/* MAIN CONTENT - routed */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Routes>
          <Route path="/biuro" element={<AccountingFirmDashboardPage />} />
          <Route path="/" element={<DashboardPage />} />
          <Route path="/entity/new" element={<DashboardPage panel="new-entity" />} />
          <Route path="/entity/:entityId" element={<EntityPage />} />
          <Route path="/entity/:entityId/edit" element={<EntityPage panel="edit-entity" />} />
          <Route path="/entity/:entityId/project/new" element={<EntityPage panel="new-project" />} />
          <Route path="/entity/:entityId/project/:projectId" element={<EntityPage />} />
          <Route path="/entity/:entityId/project/:projectId/sources" element={<EntityPage panel="sources" />} />
          <Route path="/entity/:entityId/project/:projectId/task/new" element={<EntityPage panel="new-task" />} />
          <Route path="/entity/:entityId/project/:projectId/task/:taskId" element={<EntityPage />} />
          <Route path="/entity/:entityId/project/:projectId/task/:taskId/document/new" element={<EntityPage panel="new-document" />} />
          <Route path="/entity/:entityId/project/:projectId/task/:taskId/document/:documentId" element={<EntityPage panel="view-document" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD PAGE (multi-entity / accounting view)
// ═══════════════════════════════════════════════════════════════════════════════

function DashboardPage({ panel }) {
  const { api, entities, setEntities, setError, setLoading, loading } = useAuth();
  const navigate = useNavigate();

  const handleCreateEntity = async (formData) => {
    setLoading(true);
    try {
      const entity = await api('/entities', { method: 'POST', body: JSON.stringify(formData) });
      setEntities(prev => [...prev, entity]);
      navigate(`/entity/${entity.id}`);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <>
      <MultiEntityView
        entities={entities}
        api={api}
        onSelectEntity={(entity) => navigate(`/entity/${entity.id}`)}
        onCreateEntity={() => navigate('/entity/new')}
      />
      {panel === 'new-entity' && (
        <aside style={{
          width: '380px', background: COLORS.bgSecondary,
          borderLeft: `1px solid ${COLORS.border}`,
          display: 'flex', flexDirection: 'column',
        }}>
          <RightPanel
            type="entity" data={null}
            onClose={() => navigate('/')}
            onCreateEntity={handleCreateEntity}
            onCreateProject={() => {}} onCreateTask={() => {}}
            onCreateDocument={() => {}} onUpdateDocumentMetadata={() => {}}
            loading={loading}
          />
        </aside>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNTING FIRM PAGE (/biuro)
// ═══════════════════════════════════════════════════════════════════════════════

function AccountingFirmDashboardPage() {
  const { api } = useAuth();
  return <AccountingFirmDashboard api={api} />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY PAGE (single entity view with sidebar + documents)
// ═══════════════════════════════════════════════════════════════════════════════

function EntityPage({ panel }) {
  const { entityId, projectId, taskId, documentId } = useParams();
  const { api, entities, setEntities, setError, setLoading, loading, refreshEntities } = useAuth();
  const navigate = useNavigate();

  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [sources, setSources] = useState([]);

  const entity = entities.find(e => e.id === entityId);
  const activeProject = projects.find(p => p.id === projectId) || null;
  const activeTask = tasks.find(t => t.id === taskId) || null;
  const selectedDocument = documents.find(d => d.id === documentId) || null;

  // Load projects when entity changes
  useEffect(() => {
    if (!entityId) return;
    api(`/projects?entity_id=${entityId}`).then(data => {
      setProjects(data);
      // Auto-select first project if none selected
      if (!projectId && data.length > 0) {
        navigate(`/entity/${entityId}/project/${data[0].id}`, { replace: true });
      }
    }).catch(e => setError(e.message));
  }, [entityId]);

  // Load tasks and sources when project changes
  useEffect(() => {
    if (!projectId) { setTasks([]); setSources([]); return; }
    api(`/projects/${projectId}/tasks`).then(data => {
      setTasks(data);
      if (!taskId && data.length > 0) {
        navigate(`/entity/${entityId}/project/${projectId}/task/${data[0].id}`, { replace: true });
      }
    }).catch(e => setError(e.message));
    api(`/projects/${projectId}/sources`).then(setSources).catch(() => setSources([]));
  }, [projectId]);

  // Load documents when task changes
  useEffect(() => {
    if (!taskId) { setDocuments([]); return; }
    api(`/tasks/${taskId}/documents`).then(setDocuments).catch(e => setError(e.message));
  }, [taskId]);

  // Base path builders
  const entityPath = `/entity/${entityId}`;
  const projectPath = projectId ? `${entityPath}/project/${projectId}` : null;
  const taskPath = taskId ? `${projectPath}/task/${taskId}` : null;

  // CRUD handlers
  const handleCreateEntity = async (formData) => {
    setLoading(true);
    try {
      const ent = await api('/entities', { method: 'POST', body: JSON.stringify(formData) });
      setEntities(prev => [...prev, ent]);
      navigate(`/entity/${ent.id}`);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleCreateProject = async (formData) => {
    setLoading(true);
    try {
      if (formData.template_id) {
        // Template-based creation with auto-generated tasks
        const result = await api('/projects/from-template', {
          method: 'POST',
          body: JSON.stringify({
            entity_id: entityId,
            template_id: formData.template_id,
            year: formData.year || new Date().getFullYear(),
            name: formData.name || null,
          }),
        });
        // Refresh projects list
        const updatedProjects = await api(`/projects?entity_id=${entityId}`);
        setProjects(updatedProjects);
        navigate(`${entityPath}/project/${result.project.id}`);
      } else {
        const project = await api('/projects', {
          method: 'POST',
          body: JSON.stringify({ ...formData, entity_id: entityId }),
        });
        setProjects(prev => [...prev, project]);
        navigate(`${entityPath}/project/${project.id}`);
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleCreateTask = async (formData) => {
    setLoading(true);
    try {
      const task = await api('/tasks', {
        method: 'POST',
        body: JSON.stringify({ ...formData, project_id: projectId }),
      });
      setTasks(prev => [...prev, task]);
      navigate(`${projectPath}/task/${task.id}`);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleCreateDocument = async (formData) => {
    setLoading(true);
    try {
      const doc = await api('/documents', {
        method: 'POST',
        body: JSON.stringify({ ...formData, task_id: taskId }),
      });
      setDocuments(prev => [...prev, doc]);
      navigate(`${taskPath}/document/${doc.id}`);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleUpdateDocumentMetadata = async (docId, metadata) => {
    setLoading(true);
    try {
      const updated = await api(`/documents/${docId}/metadata`, {
        method: 'PATCH',
        body: JSON.stringify(metadata),
      });
      setDocuments(prev => prev.map(d => d.id === docId ? updated : d));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  // Determine right panel type and data
  let panelType = null, panelData = null, panelClose = entityPath;
  if (panel === 'edit-entity') { panelType = 'entity'; panelData = entity; panelClose = entityPath; }
  else if (panel === 'new-entity') { panelType = 'entity'; panelData = null; panelClose = entityPath; }
  else if (panel === 'new-project') { panelType = 'project'; panelData = null; panelClose = entityPath; }
  else if (panel === 'sources') { panelType = 'sources'; panelData = { sources, projectId }; panelClose = projectPath || entityPath; }
  else if (panel === 'new-task') { panelType = 'task'; panelData = null; panelClose = projectPath || entityPath; }
  else if (panel === 'new-document') { panelType = 'document'; panelData = null; panelClose = taskPath || entityPath; }
  else if (panel === 'view-document') { panelType = 'document'; panelData = selectedDocument; panelClose = taskPath || entityPath; }

  return (
    <>
      {/* LEFT SIDEBAR */}
      <aside style={{
        width: '260px', background: COLORS.bgSecondary,
        borderRight: `1px solid ${COLORS.border}`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Podmiot section */}
        <div style={{ padding: '12px', borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '10px', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>
              Podmiot
            </span>
            <Link to="/entity/new" style={{
              background: 'transparent', border: 'none', color: COLORS.primary,
              cursor: 'pointer', fontSize: '16px', padding: '2px 6px', textDecoration: 'none',
            }}>+</Link>
          </div>
          {entity && (
            <Link to={`${entityPath}/edit`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{
                padding: '10px', background: COLORS.bgTertiary,
                borderRadius: '8px', cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '20px' }}>{ENTITY_TYPES[entity.type]?.icon}</span>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: '500' }}>{entity.name}</div>
                    <div style={{ fontSize: '10px', color: COLORS.textMuted }}>
                      NIP: {entity.nip || 'brak'}
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          )}
        </div>

        {/* Projekty section */}
        <div style={{ padding: '12px', borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '10px', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>
              Projekty
            </span>
            <Link to={`${entityPath}/project/new`} style={{
              color: COLORS.primary, fontSize: '16px', padding: '2px 6px', textDecoration: 'none',
            }}>+</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {projects.map(project => (
              <Link
                key={project.id}
                to={`${entityPath}/project/${project.id}`}
                style={{
                  padding: '10px',
                  background: activeProject?.id === project.id ? COLORS.bgTertiary : 'transparent',
                  border: activeProject?.id === project.id ? `1px solid ${COLORS.border}` : '1px solid transparent',
                  borderRadius: '8px', color: COLORS.text, textDecoration: 'none',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}
              >
                <span>{PROJECT_TYPES[project.type]?.icon || '📁'}</span>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                      {project.name}
                    </span>
                    {activeProject?.id === project.id && (
                      <Link to={`${entityPath}/project/${project.id}/sources`}
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: '12px', color: COLORS.textMuted, textDecoration: 'none', padding: '2px', lineHeight: 1 }}
                        title="Źródła danych"
                      >⚙️</Link>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {project.year && (
                      <span style={{ fontSize: '10px', color: COLORS.textMuted }}>{project.year}</span>
                    )}
                    {activeProject?.id === project.id && sources.length > 0 && (
                      <span style={{ fontSize: '9px', color: COLORS.textMuted }}>
                        📥{sources.filter(s => s.direction === 'import').length} 📤{sources.filter(s => s.direction === 'export').length}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '10px', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>
              Zadania
            </span>
            {projectPath && (
              <Link to={`${projectPath}/task/new`} style={{
                color: COLORS.primary, fontSize: '16px', padding: '2px 6px', textDecoration: 'none',
              }}>+</Link>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {tasks.map(task => {
              const progress = task.docs_total > 0 ? Math.round((task.docs_described / task.docs_total) * 100) : 0;
              const status = TASK_STATUS[task.status];
              return (
                <Link
                  key={task.id}
                  to={`${projectPath}/task/${task.id}`}
                  style={{
                    padding: '10px', textDecoration: 'none',
                    background: activeTask?.id === task.id ? COLORS.bgTertiary : 'transparent',
                    border: activeTask?.id === task.id ? `1px solid ${COLORS.border}` : '1px solid transparent',
                    borderRadius: '8px', color: COLORS.text, textAlign: 'left',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '500' }}>{task.icon} {task.name}</span>
                    <span style={{ fontSize: '10px', color: status?.color }}>{status?.icon}</span>
                  </div>
                  <div style={{ height: '3px', background: COLORS.border, borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${progress}%`, height: '100%', background: progress === 100 ? COLORS.success : COLORS.primary }} />
                  </div>
                  <div style={{ fontSize: '10px', color: COLORS.textMuted, marginTop: '4px' }}>
                    {task.docs_described}/{task.docs_total} opisanych
                  </div>
                </Link>
              );
            })}
            {tasks.length === 0 && projectId && (
              <div style={{ padding: '10px', color: COLORS.textMuted, fontSize: '12px', textAlign: 'center' }}>
                Brak zadań
              </div>
            )}
          </div>
        </div>

        {/* Czynności section */}
        {activeTask && (
          <div style={{ padding: '0 12px 12px' }}>
            <span style={{ fontSize: '10px', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '8px' }}>
              Czynności
            </span>
            <ActivitiesSidebar
              activeTask={activeTask}
              documents={documents}
              setDocuments={setDocuments}
              sources={sources}
              taskPath={taskPath}
              navigate={navigate}
              api={api}
              setError={setError}
            />
          </div>
        )}
      </aside>

      {/* MAIN CONTENT - Dokumenty */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TaskContentArea
          activeTask={activeTask}
          documents={documents}
          setDocuments={setDocuments}
          sources={sources}
          selectedDocument={selectedDocument}
          taskPath={taskPath}
          navigate={navigate}
          api={api}
          setError={setError}
          loading={loading}
          setLoading={setLoading}
        />
      </main>

      {/* RIGHT PANEL */}
      {panelType && (
        <aside style={{
          width: '380px', background: COLORS.bgSecondary,
          borderLeft: `1px solid ${COLORS.border}`,
          display: 'flex', flexDirection: 'column',
        }}>
          <RightPanel
            type={panelType} data={panelData}
            onClose={() => navigate(panelClose)}
            onCreateEntity={handleCreateEntity}
            onCreateProject={handleCreateProject}
            onCreateTask={handleCreateTask}
            onCreateDocument={handleCreateDocument}
            onUpdateDocumentMetadata={handleUpdateDocumentMetadata}
            loading={loading}
            activeEntity={entity}
            activeProject={activeProject}
            activeTask={activeTask}
            api={api}
            setSources={setSources}
            setError={setError}
          />
        </aside>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MULTI-ENTITY VIEW (Accounting Dashboard)
// ═══════════════════════════════════════════════════════════════════════════════

function MultiEntityView({ entities, api, onSelectEntity, onCreateEntity }) {
  const [entityProjects, setEntityProjects] = useState({});
  const [loadingProjects, setLoadingProjects] = useState(true);

  useEffect(() => {
    const loadAllProjects = async () => {
      setLoadingProjects(true);
      const projectMap = {};
      for (const entity of entities) {
        try {
          const projects = await api(`/projects?entity_id=${entity.id}`);
          projectMap[entity.id] = projects;
        } catch (e) {
          projectMap[entity.id] = [];
        }
      }
      setEntityProjects(projectMap);
      setLoadingProjects(false);
    };
    if (entities.length > 0) {
      loadAllProjects();
    } else {
      setLoadingProjects(false);
    }
  }, [entities]);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
            Podmioty i projekty
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: COLORS.textMuted }}>
            Widok dla księgowości — {entities.length} {entities.length === 1 ? 'podmiot' : entities.length < 5 ? 'podmioty' : 'podmiotów'}
          </p>
        </div>
        <button
          onClick={onCreateEntity}
          style={{
            padding: '10px 16px',
            background: COLORS.primary,
            border: 'none',
            borderRadius: '8px',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
          }}
        >
          + Nowy podmiot
        </button>
      </div>

      {loadingProjects ? (
        <div style={{ textAlign: 'center', padding: '60px', color: COLORS.textMuted }}>
          Ładowanie...
        </div>
      ) : entities.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '80px 20px',
          color: COLORS.textMuted,
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏢</div>
          <div style={{ fontSize: '16px', marginBottom: '8px' }}>Brak podmiotów</div>
          <div style={{ fontSize: '13px' }}>Dodaj pierwszy podmiot, aby rozpocząć pracę</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '16px',
        }}>
          {entities.map(entity => {
            const projects = entityProjects[entity.id] || [];
            const typeInfo = ENTITY_TYPES[entity.type] || { icon: '🏢', label: entity.type };

            return (
              <div
                key={entity.id}
                onClick={() => onSelectEntity(entity)}
                style={{
                  background: COLORS.bgSecondary,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: '12px',
                  padding: '20px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, transform 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = COLORS.borderHover;
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = COLORS.border;
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {/* Entity header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '10px',
                    background: `${entity.color || COLORS.primary}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '22px',
                  }}>
                    {typeInfo.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', fontWeight: '600' }}>{entity.name}</div>
                    <div style={{ fontSize: '11px', color: COLORS.textMuted }}>
                      {typeInfo.label} {entity.nip ? `· NIP: ${entity.nip}` : ''}
                    </div>
                  </div>
                </div>

                {/* Projects list */}
                {projects.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {projects.map(project => {
                      const projType = PROJECT_TYPES[project.type] || { icon: '📁', label: project.type };
                      return (
                        <div
                          key={project.id}
                          style={{
                            padding: '10px 12px',
                            background: COLORS.bgTertiary,
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '14px' }}>{projType.icon}</span>
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: '500' }}>{project.name}</div>
                              {project.year && (
                                <div style={{ fontSize: '10px', color: COLORS.textMuted }}>{project.year}</div>
                              )}
                            </div>
                          </div>
                          <span style={{
                            fontSize: '10px',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: project.is_active ? `${COLORS.success}20` : `${COLORS.textMuted}20`,
                            color: project.is_active ? COLORS.success : COLORS.textMuted,
                          }}>
                            {project.is_active ? 'aktywny' : 'nieaktywny'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{
                    padding: '12px',
                    background: COLORS.bgTertiary,
                    borderRadius: '8px',
                    textAlign: 'center',
                    fontSize: '12px',
                    color: COLORS.textMuted,
                  }}>
                    Brak projektów
                  </div>
                )}

                {/* Footer stats */}
                <div style={{
                  marginTop: '12px',
                  paddingTop: '12px',
                  borderTop: `1px solid ${COLORS.border}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  color: COLORS.textMuted,
                }}>
                  <span>{projects.length} {projects.length === 1 ? 'projekt' : projects.length < 5 ? 'projekty' : 'projektów'}</span>
                  <span style={{ color: COLORS.primary }}>Otwórz →</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN PAGE (/login)
// ═══════════════════════════════════════════════════════════════════════════════

function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState('password'); // 'password' | 'magic'
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setMessage('');
    setSubmitting(true);
    try {
      const body = new URLSearchParams({ username: email, password });
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (response.ok) {
        const tokenData = await response.json();
        login(tokenData.access_token);
      } else {
        setMessage('Nieprawidłowy email lub hasło.');
      }
    } catch (err) {
      setMessage('Wystąpił błąd połączenia.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMagicLink = async (e) => {
    e.preventDefault();
    setMessage('');
    setSubmitting(true);
    try {
      if (!isCodeSent) {
        const response = await fetch(`${API_URL}/auth/magic-link/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        if (response.ok) {
          const data = await response.json();
          setIsCodeSent(true);
          setMessage(data.message || 'Link logowania został wysłany.');
        } else {
          setMessage('Wystąpił błąd. Spróbuj ponownie.');
        }
      } else {
        const response = await fetch(`${API_URL}/auth/magic-link/login-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code }),
        });
        if (response.ok) {
          const tokenData = await response.json();
          login(tokenData.access_token);
        } else {
          setMessage('Nieprawidłowy kod.');
        }
      }
    } catch (err) {
      setMessage('Wystąpił błąd połączenia.');
    } finally {
      setSubmitting(false);
    }
  };

  const DEMO_ACCOUNTS = [
    { email: 'biuro@exef.pl', label: '🏢 Biuro Rachunkowe', desc: 'widok księgowego z delegacjami' },
    { email: 'jan.kowalski@example.pl', label: '👤 Jan Kowalski', desc: 'JDG - klient biura' },
    { email: 'kontakt@techstartup.pl', label: '🏢 TechStartup', desc: 'Sp. z o.o. - klient biura' },
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: `linear-gradient(135deg, ${COLORS.bg} 0%, #1a1333 100%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', -apple-system, sans-serif", color: COLORS.text,
    }}>
      <div style={{
        width: '420px', background: COLORS.bgSecondary,
        borderRadius: '16px', padding: '32px',
        border: `1px solid ${COLORS.border}`,
      }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            fontSize: '28px', fontWeight: '800',
            background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            marginBottom: '8px',
          }}>EXEF</div>
          <div style={{ color: COLORS.textMuted, fontSize: '13px' }}>Document Flow Engine</div>
        </div>

        {/* Mode tabs */}
        <div style={{
          display: 'flex', marginBottom: '20px', background: COLORS.bgTertiary,
          borderRadius: '8px', border: `1px solid ${COLORS.border}`, overflow: 'hidden',
        }}>
          {[
            { id: 'password', label: '🔑 Hasło' },
            { id: 'magic', label: '✉️ Magic Link' },
          ].map(m => (
            <button key={m.id} onClick={() => { setMode(m.id); setMessage(''); setIsCodeSent(false); }}
              style={{
                flex: 1, padding: '10px', border: 'none',
                background: mode === m.id ? COLORS.primary : 'transparent',
                color: mode === m.id ? '#fff' : COLORS.textMuted,
                cursor: 'pointer', fontSize: '13px', fontWeight: '500',
              }}
            >{m.label}</button>
          ))}
        </div>

        {mode === 'password' ? (
          <form onSubmit={handlePasswordLogin}>
            <input
              type="email" placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)} required
              style={{
                width: '100%', padding: '12px', marginBottom: '12px',
                background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
                borderRadius: '8px', color: COLORS.text, fontSize: '14px', boxSizing: 'border-box',
              }}
            />
            <input
              type="password" placeholder="Hasło" value={password}
              onChange={(e) => setPassword(e.target.value)} required
              style={{
                width: '100%', padding: '12px', marginBottom: '16px',
                background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
                borderRadius: '8px', color: COLORS.text, fontSize: '14px', boxSizing: 'border-box',
              }}
            />
            {message && (
              <div style={{
                padding: '10px', marginBottom: '12px', borderRadius: '8px',
                background: `${COLORS.danger}20`, color: COLORS.danger,
                fontSize: '13px', textAlign: 'center',
              }}>{message}</div>
            )}
            <button type="submit" disabled={submitting || !email || !password}
              style={{
                width: '100%', padding: '14px',
                background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
                border: 'none', borderRadius: '8px', color: '#fff',
                fontSize: '14px', fontWeight: '600',
                cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1,
              }}
            >{submitting ? '...' : 'Zaloguj'}</button>
          </form>
        ) : (
          <form onSubmit={handleMagicLink}>
            <input
              type="email" placeholder="Email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              required disabled={isCodeSent}
              style={{
                width: '100%', padding: '12px', marginBottom: '12px',
                background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
                borderRadius: '8px', color: COLORS.text, fontSize: '14px',
                boxSizing: 'border-box', opacity: isCodeSent ? 0.6 : 1,
              }}
            />
            {isCodeSent && (
              <input
                type="text" placeholder="Kod jednorazowy" value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required maxLength={8}
                style={{
                  width: '100%', padding: '12px', marginBottom: '16px',
                  background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
                  borderRadius: '8px', color: COLORS.text, fontSize: '14px',
                  fontWeight: 'bold', letterSpacing: '2px', textAlign: 'center', boxSizing: 'border-box',
                }}
              />
            )}
            {message && (
              <div style={{
                padding: '10px', marginBottom: '12px', borderRadius: '8px',
                background: isCodeSent ? `${COLORS.success}20` : `${COLORS.warning}20`,
                color: isCodeSent ? COLORS.success : COLORS.warning,
                fontSize: '13px', textAlign: 'center',
              }}>{message}</div>
            )}
            <button type="submit" disabled={submitting || !email || (isCodeSent && !code)}
              style={{
                width: '100%', padding: '14px',
                background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
                border: 'none', borderRadius: '8px', color: '#fff',
                fontSize: '14px', fontWeight: '600',
                cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1,
              }}
            >{submitting ? '...' : !isCodeSent ? 'Wyślij link logowania' : 'Zaloguj kodem'}</button>
          </form>
        )}

        {/* Demo accounts */}
        <div style={{
          marginTop: '24px', paddingTop: '20px',
          borderTop: `1px solid ${COLORS.border}`,
        }}>
          <div style={{ fontSize: '11px', color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: '10px', textAlign: 'center' }}>
            Konta demo (hasło: demo123)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {DEMO_ACCOUNTS.map(acc => (
              <button key={acc.email}
                onClick={() => { setEmail(acc.email); setPassword('demo123'); setMode('password'); setMessage(''); }}
                style={{
                  padding: '10px 12px', background: COLORS.bgTertiary,
                  border: `1px solid ${COLORS.border}`, borderRadius: '8px',
                  color: COLORS.text, cursor: 'pointer', textAlign: 'left',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '13px' }}>{acc.label}</span>
                <span style={{ fontSize: '11px', color: COLORS.textMuted }}>{acc.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITIES SIDEBAR - Czynności: Dodaj, Import, Opis, Eksport
// ═══════════════════════════════════════════════════════════════════════════════

function ActivitiesSidebar({ activeTask, documents, setDocuments, sources, taskPath, navigate, api, setError }) {
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const importSources = sources.filter(s => s.direction === 'import');
  const exportSources = sources.filter(s => s.direction === 'export');

  const docsNew = documents.filter(d => d.status === 'new');
  const docsDescribed = documents.filter(d => d.status === 'described' || d.status === 'approved');
  const docsExported = documents.filter(d => d.status === 'exported');
  const docsTotal = documents.length;

  const handleImport = async (source) => {
    if (!activeTask) return;
    setImporting(true);
    try {
      await api('/flow/import', {
        method: 'POST',
        body: JSON.stringify({ source_id: source.id, task_id: activeTask.id }),
      });
      const docs = await api(`/tasks/${activeTask.id}/documents`);
      setDocuments(docs);
    } catch (e) { setError(e.message); }
    finally { setImporting(false); }
  };

  const handleExport = async (source) => {
    if (!activeTask) return;
    setExporting(true);
    try {
      await api('/flow/export', {
        method: 'POST',
        body: JSON.stringify({ source_id: source.id, task_id: activeTask.id }),
      });
      const docs = await api(`/tasks/${activeTask.id}/documents`);
      setDocuments(docs);
    } catch (e) { setError(e.message); }
    finally { setExporting(false); }
  };

  const phaseColor = (s) => {
    if (s === 'completed') return COLORS.success;
    if (s === 'in_progress') return COLORS.warning;
    return COLORS.textMuted;
  };

  const toggle = (key) => setExpanded(expanded === key ? null : key);

  const miniTableStyle = {
    width: '100%', borderCollapse: 'collapse', fontSize: '10px', marginTop: '4px',
  };
  const miniThStyle = {
    padding: '3px 4px', textAlign: 'left', color: COLORS.textMuted, fontWeight: '500',
    borderBottom: `1px solid ${COLORS.border}`, fontSize: '9px', textTransform: 'uppercase',
  };
  const miniTdStyle = {
    padding: '3px 4px', borderBottom: `1px solid ${COLORS.border}08`,
  };

  const MiniDocTable = ({ docs, emptyMsg, limit = 5 }) => {
    if (docs.length === 0) return (
      <div style={{ padding: '6px 0', fontSize: '10px', color: COLORS.textMuted, textAlign: 'center' }}>
        {emptyMsg}
      </div>
    );
    const shown = docs.slice(0, limit);
    return (
      <>
        <table style={miniTableStyle}>
          <thead>
            <tr>
              <th style={miniThStyle}>Numer</th>
              <th style={{ ...miniThStyle, textAlign: 'right' }}>Kwota</th>
              <th style={{ ...miniThStyle, textAlign: 'center' }}>St.</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(d => {
              const st = STATUS_CONFIG[d.status];
              return (
                <tr key={d.id} onClick={() => taskPath && navigate(`${taskPath}/document/${d.id}`)}
                  style={{ cursor: 'pointer' }}>
                  <td style={miniTdStyle}>
                    <div style={{ fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100px' }}>
                      {d.number || '—'}
                    </div>
                  </td>
                  <td style={{ ...miniTdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {d.amount_gross?.toLocaleString('pl-PL', { maximumFractionDigits: 0 }) || '—'}
                  </td>
                  <td style={{ ...miniTdStyle, textAlign: 'center' }}>
                    <span style={{ color: st?.color, fontSize: '9px' }}>{st?.icon}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {docs.length > limit && (
          <div style={{ fontSize: '9px', color: COLORS.textMuted, textAlign: 'center', padding: '3px 0' }}>
            +{docs.length - limit} więcej
          </div>
        )}
      </>
    );
  };

  const ActivityRow = ({ icon, label, detail, color, status, onClick, isExpanded, children }) => (
    <div>
      <div onClick={onClick} style={{
        padding: '8px 10px', borderRadius: '8px',
        background: isExpanded ? COLORS.bgTertiary : 'transparent',
        border: isExpanded ? `1px solid ${COLORS.border}` : '1px solid transparent',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <span style={{ fontSize: '14px', width: '20px', textAlign: 'center' }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '12px', fontWeight: '500' }}>{label}</div>
          <div style={{ fontSize: '10px', color: COLORS.textMuted }}>{detail}</div>
        </div>
        {status && (
          <span style={{
            fontSize: '8px', padding: '2px 5px', borderRadius: '4px',
            background: `${color}20`, color: color,
          }}>
            {status === 'completed' ? '✓' : status === 'in_progress' ? '…' : '○'}
          </span>
        )}
        {onClick && (
          <span style={{ fontSize: '10px', color: COLORS.textMuted }}>
            {isExpanded ? '▾' : '▸'}
          </span>
        )}
      </div>
      {isExpanded && (
        <div style={{ padding: '4px 4px 6px 12px' }}>
          {children}
        </div>
      )}
    </div>
  );

  const impStatus = activeTask.import_status || 'not_started';
  const descStatus = activeTask.describe_status || 'not_started';
  const expStatus = activeTask.export_status || 'not_started';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      {/* Dodaj */}
      <ActivityRow icon="➕" label="Dodaj" detail="Nowy dokument"
        color={COLORS.primary} status={null}
        onClick={() => taskPath && navigate(`${taskPath}/document/new`)}
        isExpanded={false}
      />

      {/* Import */}
      <ActivityRow icon="📥" label="Import"
        detail={`${importSources.length} źródeł · ${docsTotal} dok.`}
        color={phaseColor(impStatus)} status={impStatus}
        onClick={() => toggle('import')} isExpanded={expanded === 'import'}
      >
        {importSources.length > 0 && (
          <div>
            <div style={{ fontSize: '9px', color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: '3px' }}>Importuj z:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {importSources.map(src => (
                <button key={src.id} onClick={(e) => { e.stopPropagation(); handleImport(src); }} disabled={importing}
                  style={{
                    padding: '5px 8px', fontSize: '10px',
                    border: `1px solid ${COLORS.border}`, borderRadius: '6px',
                    background: COLORS.bgSecondary, color: COLORS.text,
                    cursor: importing ? 'wait' : 'pointer', opacity: importing ? 0.6 : 1,
                    display: 'flex', alignItems: 'center', gap: '5px', textAlign: 'left',
                  }}>
                  <span>{src.icon}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{src.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {importSources.length === 0 && (
          <div style={{ fontSize: '10px', color: COLORS.textMuted, textAlign: 'center', padding: '4px 0' }}>Brak skonfigurowanych źródeł</div>
        )}
      </ActivityRow>

      {/* Opis */}
      <ActivityRow icon="✏️" label="Opis"
        detail={`${docsNew.length} do opisu · ${docsDescribed.length} opisanych`}
        color={phaseColor(descStatus)} status={descStatus}
        onClick={() => toggle('describe')} isExpanded={expanded === 'describe'}
      >
        {docsNew.length > 0 && (
          <>
            <div style={{ fontSize: '9px', color: COLORS.warning, textTransform: 'uppercase', marginBottom: '2px' }}>
              Do opisu ({docsNew.length})
            </div>
            <MiniDocTable docs={docsNew} emptyMsg="" limit={5} />
          </>
        )}
        {docsDescribed.length > 0 && (
          <div style={{ marginTop: '6px' }}>
            <div style={{ fontSize: '9px', color: COLORS.success, textTransform: 'uppercase', marginBottom: '2px' }}>
              Opisane ({docsDescribed.length})
            </div>
            <MiniDocTable docs={docsDescribed} emptyMsg="" limit={5} />
          </div>
        )}
        {docsNew.length === 0 && docsDescribed.length === 0 && (
          <div style={{ padding: '6px 0', fontSize: '10px', color: COLORS.textMuted, textAlign: 'center' }}>
            Brak dokumentów do opisu
          </div>
        )}
      </ActivityRow>

      {/* Eksport */}
      <ActivityRow icon="📤" label="Eksport"
        detail={`${exportSources.length} celów · ${docsDescribed.length} gotowych`}
        color={phaseColor(expStatus)} status={expStatus}
        onClick={() => toggle('export')} isExpanded={expanded === 'export'}
      >
        {exportSources.length > 0 && (
          <div style={{ marginBottom: '6px' }}>
            <div style={{ fontSize: '9px', color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: '3px' }}>Eksportuj do:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {exportSources.map(src => (
                <button key={src.id} onClick={(e) => { e.stopPropagation(); handleExport(src); }} disabled={exporting}
                  style={{
                    padding: '5px 8px', fontSize: '10px',
                    border: `1px solid ${COLORS.border}`, borderRadius: '6px',
                    background: COLORS.bgSecondary, color: COLORS.text,
                    cursor: exporting ? 'wait' : 'pointer', opacity: exporting ? 0.6 : 1,
                    display: 'flex', alignItems: 'center', gap: '5px', textAlign: 'left',
                  }}>
                  <span>{src.icon}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{src.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ fontSize: '9px', color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: '2px' }}>
          Gotowe do eksportu ({docsDescribed.length})
        </div>
        <MiniDocTable docs={docsDescribed} emptyMsg="Brak dokumentów gotowych do eksportu" limit={5} />
        {docsExported.length > 0 && (
          <div style={{ marginTop: '6px' }}>
            <div style={{ fontSize: '9px', color: COLORS.success, textTransform: 'uppercase', marginBottom: '2px' }}>
              Wyeksportowane ({docsExported.length})
            </div>
            <MiniDocTable docs={docsExported} emptyMsg="" limit={3} />
          </div>
        )}
      </ActivityRow>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TASK CONTENT AREA - Document list + status bar
// ═══════════════════════════════════════════════════════════════════════════════

function TaskContentArea({ activeTask, documents, setDocuments, sources, selectedDocument, taskPath, navigate, api, setError, loading, setLoading }) {
  if (!activeTask) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: COLORS.textMuted }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
        <div style={{ fontSize: '14px' }}>Wybierz zadanie z listy</div>
      </div>
    );
  }

  const docsNew = documents.filter(d => d.status === 'new').length;
  const docsDescribed = documents.filter(d => d.status === 'described' || d.status === 'approved').length;
  const docsExported = documents.filter(d => d.status === 'exported').length;
  const docsTotal = documents.length;
  const notExported = documents.filter(d => d.status !== 'exported').length;

  return (
    <>
      {/* Header + status */}
      <div style={{ borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
              {activeTask.icon} {activeTask.name}
            </h2>
            <div style={{ fontSize: '12px', color: COLORS.textMuted, marginTop: '2px' }}>
              {activeTask.period_start} — {activeTask.period_end}
              {activeTask.deadline && <span> · Deadline: <strong style={{ color: COLORS.warning }}>{activeTask.deadline}</strong></span>}
            </div>
          </div>
        </div>

        {docsTotal > 0 && (
          <div style={{
            padding: '0 16px 10px', display: 'flex', gap: '16px', fontSize: '11px', color: COLORS.textMuted,
          }}>
            <span>Łącznie: <strong style={{ color: COLORS.text }}>{docsTotal}</strong></span>
            <span>Nowe: <strong style={{ color: COLORS.warning }}>{docsNew}</strong></span>
            <span>Opisane: <strong style={{ color: COLORS.primary }}>{docsDescribed}</strong></span>
            <span>Wyeksportowane: <strong style={{ color: COLORS.success }}>{docsExported}</strong></span>
            {notExported > 0 && (
              <span style={{ color: COLORS.danger }}>⚠ Do eksportu: <strong>{notExported}</strong></span>
            )}
          </div>
        )}
      </div>

      {/* Document list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {docsTotal > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: '10px', color: COLORS.textMuted, fontWeight: '500', textTransform: 'uppercase' }}>Numer</th>
                <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: '10px', color: COLORS.textMuted, fontWeight: '500', textTransform: 'uppercase' }}>Kontrahent</th>
                <th style={{ padding: '10px 8px', textAlign: 'right', fontSize: '10px', color: COLORS.textMuted, fontWeight: '500', textTransform: 'uppercase' }}>Kwota</th>
                <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: '10px', color: COLORS.textMuted, fontWeight: '500', textTransform: 'uppercase' }}>Kategoria</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '10px', color: COLORS.textMuted, fontWeight: '500', textTransform: 'uppercase' }}>Status</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', fontSize: '10px', color: COLORS.textMuted, fontWeight: '500', textTransform: 'uppercase' }}>Źródło</th>
              </tr>
            </thead>
            <tbody>
              {documents.map(doc => {
                const status = STATUS_CONFIG[doc.status];
                return (
                  <tr key={doc.id} onClick={() => navigate(`${taskPath}/document/${doc.id}`)}
                    style={{
                      borderBottom: `1px solid ${COLORS.border}`, cursor: 'pointer',
                      background: selectedDocument?.id === doc.id ? COLORS.bgTertiary : 'transparent',
                    }}>
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
                          fontSize: '11px', padding: '4px 8px', borderRadius: '4px',
                          background: `${COLORS.primary}20`, color: COLORS.primary,
                        }}>{doc.metadata.category}</span>
                      ) : (
                        <span style={{ color: COLORS.warning, fontSize: '11px' }}>⚠️ Brak</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                      <span style={{
                        fontSize: '11px', padding: '4px 8px', borderRadius: '4px',
                        background: `${status?.color}20`, color: status?.color,
                      }}>{status?.icon} {status?.label}</span>
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                      <span style={{ fontSize: '10px', color: COLORS.textMuted }}>
                        {doc.source || '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', color: COLORS.textMuted,
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📄</div>
            <div style={{ fontSize: '14px' }}>Brak dokumentów w tym zadaniu</div>
            <div style={{ fontSize: '12px', marginTop: '8px' }}>Użyj Import w panelu Czynności po lewej</div>
          </div>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOURCE CONFIG PANEL - Zarządzanie źródłami danych per projekt
// ═══════════════════════════════════════════════════════════════════════════════

function SourceConfigPanel({ data, onClose, api, setSources, setError }) {
  const { sources = [], projectId } = data || {};
  const [adding, setAdding] = useState(null); // 'import' | 'export' | null
  const [newSource, setNewSource] = useState({});
  const [sourceTypes, setSourceTypes] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/source-types').then(setSourceTypes).catch(() => {});
  }, []);

  const importSources = sources.filter(s => s.direction === 'import');
  const exportSources = sources.filter(s => s.direction === 'export');

  const handleAdd = async () => {
    if (!newSource.source_type || !newSource.name) return;
    setBusy(true);
    try {
      await api(`/projects/${projectId}/sources`, {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          direction: adding,
          source_type: newSource.source_type,
          name: newSource.name,
          config: newSource.config || {},
        }),
      });
      const updated = await api(`/projects/${projectId}/sources`);
      setSources(updated);
      setAdding(null);
      setNewSource({});
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const handleDelete = async (sourceId) => {
    setBusy(true);
    try {
      await api(`/sources/${sourceId}`, { method: 'DELETE' });
      const updated = await api(`/projects/${projectId}/sources`);
      setSources(updated);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const handleToggle = async (source) => {
    setBusy(true);
    try {
      await api(`/sources/${source.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !source.is_active }),
      });
      const updated = await api(`/projects/${projectId}/sources`);
      setSources(updated);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const renderSourceList = (items, direction) => (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '8px',
      }}>
        <span style={{ fontSize: '11px', fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {direction === 'import' ? '📥 Import' : '📤 Eksport'}
        </span>
        <button onClick={() => { setAdding(direction); setNewSource({}); }}
          style={{
            background: 'transparent', border: 'none', color: COLORS.primary,
            cursor: 'pointer', fontSize: '16px', padding: '0 4px',
          }}>+</button>
      </div>
      {items.length === 0 && (
        <div style={{ padding: '12px', color: COLORS.textMuted, fontSize: '12px', textAlign: 'center', background: COLORS.bgTertiary, borderRadius: '8px' }}>
          Brak skonfigurowanych źródeł
        </div>
      )}
      {items.map(src => (
        <div key={src.id} style={{
          padding: '10px 12px', background: COLORS.bgTertiary, borderRadius: '8px',
          border: `1px solid ${COLORS.border}`, marginBottom: '6px',
          opacity: src.is_active ? 1 : 0.5,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
              <span style={{ fontSize: '16px' }}>{src.icon}</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '500' }}>{src.name}</div>
                <div style={{ fontSize: '10px', color: COLORS.textMuted }}>{src.source_type}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button onClick={() => handleToggle(src)} disabled={busy}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontSize: '12px', color: src.is_active ? COLORS.success : COLORS.textMuted,
                }}
                title={src.is_active ? 'Aktywny' : 'Nieaktywny'}
              >{src.is_active ? '🟢' : '⚪'}</button>
              <button onClick={() => handleDelete(src.id)} disabled={busy}
                style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontSize: '12px', color: COLORS.danger,
                }}
                title="Usuń"
              >🗑️</button>
            </div>
          </div>
          {src.last_run_at && (
            <div style={{ fontSize: '10px', color: COLORS.textMuted, marginTop: '4px' }}>
              Ostatnio: {new Date(src.last_run_at).toLocaleString('pl-PL')}
              {src.last_run_status && <span> · {src.last_run_status === 'success' ? '✅' : '❌'} {src.last_run_count} dok.</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const availableTypes = sourceTypes
    ? (adding === 'import' ? sourceTypes.import_types : sourceTypes.export_types)
    : [];

  return (
    <>
      <div style={{
        padding: '16px', borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600' }}>⚙️ Źródła danych</h3>
        <button onClick={onClose} style={{
          background: COLORS.bgTertiary, border: 'none', borderRadius: '6px',
          color: COLORS.textMuted, cursor: 'pointer', width: '28px', height: '28px', fontSize: '14px',
        }}>×</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {renderSourceList(importSources, 'import')}
        {renderSourceList(exportSources, 'export')}

        {/* Add source form */}
        {adding && (
          <div style={{
            padding: '12px', background: `${COLORS.primary}10`, borderRadius: '10px',
            border: `1px solid ${COLORS.primary}40`, marginTop: '8px',
          }}>
            <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '10px', color: COLORS.primary }}>
              Nowe źródło ({adding === 'import' ? 'import' : 'eksport'})
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: COLORS.textMuted, marginBottom: '4px' }}>Typ</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {availableTypes.map(t => (
                  <button key={t.type} type="button"
                    onClick={() => {
                      setNewSource(prev => ({
                        ...prev,
                        source_type: t.type,
                        name: prev.name || t.name,
                      }));
                    }}
                    style={{
                      padding: '6px 10px', fontSize: '11px',
                      border: `1px solid ${newSource.source_type === t.type ? COLORS.primary : COLORS.border}`,
                      borderRadius: '6px',
                      background: newSource.source_type === t.type ? `${COLORS.primary}20` : COLORS.bgTertiary,
                      color: newSource.source_type === t.type ? COLORS.primary : COLORS.text,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                    }}
                  >
                    <span>{t.icon}</span> {t.name}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: COLORS.textMuted, marginBottom: '4px' }}>Nazwa</label>
              <input
                value={newSource.name || ''}
                onChange={(e) => setNewSource(prev => ({ ...prev, name: e.target.value }))}
                placeholder="np. Email biuro@firma.pl"
                style={{
                  width: '100%', padding: '8px 10px', background: COLORS.bgTertiary,
                  border: `1px solid ${COLORS.border}`, borderRadius: '6px',
                  color: COLORS.text, fontSize: '12px', boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={handleAdd} disabled={busy || !newSource.source_type || !newSource.name}
                style={{
                  flex: 1, padding: '8px', fontSize: '12px', fontWeight: '500',
                  background: COLORS.primary, border: 'none', borderRadius: '6px',
                  color: '#fff', cursor: busy ? 'wait' : 'pointer',
                  opacity: (!newSource.source_type || !newSource.name || busy) ? 0.5 : 1,
                }}
              >Dodaj</button>
              <button onClick={() => { setAdding(null); setNewSource({}); }}
                style={{
                  padding: '8px 12px', fontSize: '12px',
                  background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
                  borderRadius: '6px', color: COLORS.textMuted, cursor: 'pointer',
                }}
              >Anuluj</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RIGHT PANEL - Formularze
// ═══════════════════════════════════════════════════════════════════════════════

function RightPanel({ 
  type, data, onClose, 
  onCreateEntity, onCreateProject, onCreateTask, onCreateDocument, onUpdateDocumentMetadata,
  loading, activeEntity, activeProject, activeTask,
  api, setSources, setError,
}) {
  // Sources panel has its own rendering
  if (type === 'sources') {
    return <SourceConfigPanel data={data} onClose={onClose} api={api} setSources={setSources} setError={setError} />;
  }

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

        {/* PROJECT FORM — template-based */}
        {type === 'project' && (
          <ProjectFormWithTemplates formData={formData} update={update} />
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

function ProjectFormWithTemplates({ formData, update }) {
  const [templates, setTemplates] = useState([]);
  const [mode, setMode] = useState('template'); // 'template' | 'manual'

  useEffect(() => {
    fetch(`${API_URL}/project-templates`)
      .then(r => r.json())
      .then(data => setTemplates(data))
      .catch(() => {});
  }, []);

  const selectedTemplate = templates.find(t => t.id === formData.template_id);

  return (
    <>
      {/* Mode toggle */}
      <div style={{
        display: 'flex', marginBottom: '16px', background: COLORS.bgTertiary,
        borderRadius: '8px', border: `1px solid ${COLORS.border}`, overflow: 'hidden',
      }}>
        {[
          { id: 'template', label: '📋 Z szablonu' },
          { id: 'manual', label: '✏️ Ręcznie' },
        ].map(m => (
          <button key={m.id} type="button" onClick={() => {
            setMode(m.id);
            if (m.id === 'manual') update('template_id', null);
          }}
            style={{
              flex: 1, padding: '10px', border: 'none',
              background: mode === m.id ? COLORS.primary : 'transparent',
              color: mode === m.id ? '#fff' : COLORS.textMuted,
              cursor: 'pointer', fontSize: '12px', fontWeight: '500',
            }}
          >{m.label}</button>
        ))}
      </div>

      {mode === 'template' ? (
        <>
          {/* Template cards */}
          <label style={{ display: 'block', fontSize: '12px', color: COLORS.textMuted, marginBottom: '8px' }}>
            Wybierz szablon projektu
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {templates.map(t => (
              <div
                key={t.id}
                onClick={() => {
                  update('template_id', t.id);
                  update('type', t.project_type);
                  if (!formData.year) update('year', new Date().getFullYear());
                }}
                style={{
                  padding: '12px',
                  background: formData.template_id === t.id ? `${t.default_color || COLORS.primary}20` : COLORS.bgTertiary,
                  border: `1px solid ${formData.template_id === t.id ? (t.default_color || COLORS.primary) : COLORS.border}`,
                  borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>{t.default_icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: '500' }}>{t.name}</div>
                    <div style={{ fontSize: '11px', color: COLORS.textMuted }}>
                      {t.task_recurrence === 'monthly' ? 'Co miesiąc' : t.task_recurrence === 'quarterly' ? 'Co kwartał' : 'Raz w roku'}
                      {' · termin: '}{t.deadline_day}-ego
                    </div>
                  </div>
                  {formData.template_id === t.id && (
                    <span style={{ color: COLORS.success, fontSize: '16px' }}>✓</span>
                  )}
                </div>
                {t.description && formData.template_id === t.id && (
                  <div style={{ fontSize: '11px', color: COLORS.textMuted, marginTop: '6px', paddingLeft: '26px' }}>
                    {t.description}
                  </div>
                )}
              </div>
            ))}
          </div>

          {selectedTemplate && (
            <>
              <InputField label="Rok" value={formData.year || new Date().getFullYear()} onChange={(v) => update('year', parseInt(v) || null)} type="number" />
              <InputField label="Nazwa (opcjonalnie)" value={formData.name || ''} onChange={(v) => update('name', v)} placeholder={`${selectedTemplate.name} ${formData.year || new Date().getFullYear()}`} />
              <div style={{
                padding: '10px 12px', background: `${COLORS.success}15`, border: `1px solid ${COLORS.success}30`,
                borderRadius: '8px', fontSize: '11px', color: COLORS.success, marginBottom: '16px',
              }}>
                Zostanie utworzonych {selectedTemplate.task_recurrence === 'monthly' ? '12 zadań (co miesiąc)' : selectedTemplate.task_recurrence === 'quarterly' ? '4 zadania (co kwartał)' : '1 zadanie'} z deadline {selectedTemplate.deadline_day}-ego.
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <InputField label="Nazwa projektu" value={formData.name || ''} onChange={(v) => update('name', v)} required />
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: COLORS.textMuted, marginBottom: '6px' }}>Typ projektu</label>
            <select
              value={formData.type || 'ksiegowosc'}
              onChange={(e) => update('type', e.target.value)}
              style={{
                width: '100%', padding: '12px',
                background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
                borderRadius: '8px', color: COLORS.text, fontSize: '13px',
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
