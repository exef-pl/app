import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { COLORS, ENTITY_TYPES, PROJECT_TYPES, TASK_STATUS } from '../constants.js';
import { useAuth } from '../context/AuthContext.jsx';
import ActivitiesSidebar from './ActivitiesSidebar.jsx';
import TaskContentArea from './TaskContentArea.jsx';
import RightPanel from './RightPanel.jsx';

export default function EntityPage({ panel }) {
  const { entityId, projectId, taskId, documentId } = useParams();
  const { token, api, entities, setEntities, setError, setLoading, loading, refreshEntities } = useAuth();
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
    if (!entityId || !token) return;
    api(`/projects?entity_id=${entityId}`).then(data => {
      setProjects(data);
      if (!projectId && data.length > 0) {
        navigate(`/entity/${entityId}/project/${data[0].id}`, { replace: true });
      }
    }).catch(e => { if (!e.sessionExpired) setError(e.message); });
  }, [entityId]);

  // Load tasks and sources when project changes
  useEffect(() => {
    if (!projectId || !token) { setTasks([]); setSources([]); return; }
    api(`/projects/${projectId}/tasks`).then(data => {
      setTasks(data);
      if (!taskId && data.length > 0) {
        navigate(`/entity/${entityId}/project/${projectId}/task/${data[0].id}`, { replace: true });
      }
    }).catch(e => { if (!e.sessionExpired) setError(e.message); });
    api(`/projects/${projectId}/sources`).then(setSources).catch(e => { if (!e.sessionExpired) setSources([]); });
  }, [projectId]);

  // Load documents when task changes
  useEffect(() => {
    if (!taskId || !token) { setDocuments([]); return; }
    api(`/tasks/${taskId}/documents`).then(setDocuments).catch(e => { if (!e.sessionExpired) setError(e.message); });
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
    } catch (e) { if (!e.sessionExpired) setError(e.message); }
    finally { setLoading(false); }
  };

  const handleCreateProject = async (formData) => {
    setLoading(true);
    try {
      if (formData.template_id) {
        const result = await api('/projects/from-template', {
          method: 'POST',
          body: JSON.stringify({
            entity_id: entityId,
            template_id: formData.template_id,
            year: formData.year || new Date().getFullYear(),
            name: formData.name || null,
          }),
        });
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
    } catch (e) { if (!e.sessionExpired) setError(e.message); }
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
    } catch (e) { if (!e.sessionExpired) setError(e.message); }
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
    } catch (e) { if (!e.sessionExpired) setError(e.message); }
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
    } catch (e) { if (!e.sessionExpired) setError(e.message); }
    finally { setLoading(false); }
  };

  // Determine right panel type and data
  let panelType = null, panelData = null, panelClose = entityPath;
  if (panel === 'edit-entity') { panelType = 'entity'; panelData = entity; panelClose = entityPath; }
  else if (panel === 'new-entity') { panelType = 'entity'; panelData = null; panelClose = entityPath; }
  else if (panel === 'new-project') { panelType = 'project'; panelData = null; panelClose = entityPath; }
  else if (panel === 'view-project' && activeProject) { panelType = 'view-project'; panelData = activeProject; panelClose = projectPath || entityPath; }
  else if (panel === 'edit-project' && activeProject) { panelType = 'project'; panelData = activeProject; panelClose = projectPath || entityPath; }
  else if (panel === 'sources') { panelType = 'sources'; panelData = { sources, projectId }; panelClose = projectPath || entityPath; }
  else if (panel === 'view-task' && activeTask) { panelType = 'view-task'; panelData = activeTask; panelClose = taskPath || projectPath || entityPath; }
  else if (panel === 'new-task') { panelType = 'task'; panelData = null; panelClose = projectPath || entityPath; }
  else if (panel === 'new-document') { panelType = 'document'; panelData = null; panelClose = taskPath || entityPath; }
  else if (panel === 'view-document') { panelType = 'view-document'; panelData = selectedDocument; panelClose = taskPath || entityPath; }

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
                      <span
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`${entityPath}/project/${project.id}/sources`); }}
                        style={{ fontSize: '12px', color: COLORS.textMuted, cursor: 'pointer', padding: '2px', lineHeight: 1 }}
                        title="Źródła danych"
                      >⚙️</span>
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

        {/* Zadania + Czynności */}
        <div style={{ flex: 1, padding: '12px', overflow: 'auto' }}>
        {/* Zadania section */}
        <div>
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
          <div style={{ marginTop: '8px' }}>
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
              onSourceSelect={() => projectPath && navigate(`${projectPath}/sources`)}
            />
          </div>
        )}
        </div>
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
            navigate={navigate}
            onCreateEntity={handleCreateEntity}
            onCreateProject={handleCreateProject}
            onCreateTask={handleCreateTask}
            onCreateDocument={handleCreateDocument}
            onUpdateDocumentMetadata={handleUpdateDocumentMetadata}
            loading={loading}
            activeEntity={entity}
            activeProject={activeProject}
            activeTask={activeTask}
            projectId={projectId}
            setTasks={setTasks}
            setDocuments={setDocuments}
            api={api}
            setSources={setSources}
            setError={setError}
          />
        </aside>
      )}
    </>
  );
}
