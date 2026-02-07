import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import { COLORS, API_URL, ENTITY_TYPES } from './constants.js';
import { AuthContext, useAuth } from './context/AuthContext.jsx';
import AccountingFirmDashboard from './AccountingFirmDashboard.jsx';
import LoginPage from './components/LoginPage.jsx';
import MultiEntityView from './components/MultiEntityView.jsx';
import RightPanel from './components/RightPanel.jsx';
import EntityPage from './components/EntityPage.jsx';

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
      const err = new Error('Sesja wygasła');
      err.sessionExpired = true;
      throw err;
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
  const isMultiView = location.pathname === '/' || location.pathname.startsWith('/ksiegowosc') || location.pathname === '/entity/new';

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
              onClick={() => navigate('/ksiegowosc')}
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
          <Route path="/ksiegowosc" element={<DashboardPage />} />
          <Route path="/" element={<DashboardPage />} />
          <Route path="/entity/new" element={<DashboardPage panel="new-entity" />} />
          <Route path="/entity/:entityId" element={<EntityPage />} />
          <Route path="/entity/:entityId/edit" element={<EntityPage panel="edit-entity" />} />
          <Route path="/entity/:entityId/project/new" element={<EntityPage panel="new-project" />} />
          <Route path="/entity/:entityId/project/:projectId" element={<EntityPage panel="view-project" />} />
          <Route path="/entity/:entityId/project/:projectId/edit" element={<EntityPage panel="edit-project" />} />
          <Route path="/entity/:entityId/project/:projectId/sources" element={<EntityPage panel="sources" />} />
          <Route path="/entity/:entityId/project/:projectId/task/new" element={<EntityPage panel="new-task" />} />
          <Route path="/entity/:entityId/project/:projectId/task/:taskId" element={<EntityPage panel="activity-import" />} />
          <Route path="/entity/:entityId/project/:projectId/task/:taskId/import" element={<EntityPage panel="activity-import" />} />
          <Route path="/entity/:entityId/project/:projectId/task/:taskId/selected" element={<EntityPage panel="activity-selected" />} />
          <Route path="/entity/:entityId/project/:projectId/task/:taskId/export" element={<EntityPage panel="activity-export" />} />
          <Route path="/entity/:entityId/project/:projectId/task/:taskId/duplicates" element={<EntityPage panel="activity-duplicates" />} />
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
        setEntities={setEntities}
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
            onClose={() => navigate('/ksiegowosc')}
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
