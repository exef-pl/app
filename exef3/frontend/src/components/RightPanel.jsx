import React, { useState, useEffect } from 'react';
import { COLORS, API_URL, ENTITY_TYPES, PROJECT_TYPES } from '../constants.js';
import { InputField, InfoRow } from './ui.jsx';
import SourceConfigPanel from './SourceConfigPanel.jsx';

export default function RightPanel({ 
  type, data, onClose, navigate,
  onCreateEntity, onCreateProject, onCreateTask, onCreateDocument, onUpdateDocumentMetadata,
  loading, activeEntity, activeProject, activeTask,
  projectId, setTasks, setDocuments,
  selectedDocs, setSelectedDocs,
  api, setSources, setError,
  setProjects, entityId, token,
}) {
  // ALL hooks MUST come before any conditional returns (Rules of Hooks)
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (data) {
      setFormData(data);
    } else {
      setFormData({});
    }
  }, [data, type]);

  // Conditional returns — AFTER all hooks
  if (type === 'sources') {
    return <SourceConfigPanel data={data} onClose={onClose} api={api} setSources={setSources} setError={setError} />;
  }
  if (type === 'view-project' && data) {
    return <ProjectViewPanel data={data} onClose={onClose} navigate={navigate} activeTask={activeTask} api={api} setError={setError} setProjects={setProjects} entityId={entityId} />;
  }
  if (type === 'view-task' && data) {
    return <TaskViewPanel task={data} onClose={onClose} navigate={navigate} api={api} projectId={projectId} setTasks={setTasks} setError={setError} />;
  }
  if (type === 'view-document' && data) {
    return <DocumentViewPanel doc={data} onClose={onClose} api={api} setDocuments={setDocuments} setError={setError} projectTags={[...new Set([...(activeProject?.categories || []), ...(activeProject?.tags || [])])]} navigate={navigate} entityId={entityId} activeProject={activeProject} />;
  }
  if ((type === 'activity-import' || type === 'activity-selected' || type === 'activity-export' || type === 'activity-duplicates' || type === 'new-document') && data) {
    return <ActivityTabbedPanel activeTab={type} data={data} onClose={onClose} api={api} setDocuments={setDocuments} setSources={setSources} setError={setError} token={token} navigate={navigate} onCreateDocument={onCreateDocument} loading={loading} selectedDocs={selectedDocs} setSelectedDocs={setSelectedDocs} activeProject={activeProject} />;
  }

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

      {/* Tags editor — shared for both modes */}
      <ProjectTagsEditor tags={formData.tags || []} onChange={(tags) => update('tags', tags)} />
    </>
  );
}

function ProjectTagsEditor({ tags, onChange }) {
  const [newTag, setNewTag] = useState('');

  const addTag = () => {
    const t = newTag.trim();
    if (t && !tags.includes(t)) {
      onChange([...tags, t]);
      setNewTag('');
    }
  };

  const removeTag = (tag) => {
    onChange(tags.filter(t => t !== tag));
  };

  return (
    <div style={{ marginTop: '16px', padding: '12px', background: COLORS.bgTertiary, borderRadius: '8px' }}>
      <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: '8px', textTransform: 'uppercase', fontWeight: '600' }}>
        Predefiniowane tagi dokumentów
      </div>
      <div style={{ fontSize: '11px', color: COLORS.textMuted, marginBottom: '10px' }}>
        Lista tagów dostępnych przy opisywaniu dokumentów w tym projekcie
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
        {tags.map(tag => (
          <span key={tag} style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '4px 10px', fontSize: '11px', fontWeight: '500',
            background: `${COLORS.primary}20`, color: COLORS.primary,
            borderRadius: '12px',
          }}>
            {tag}
            <button type="button" onClick={() => removeTag(tag)} style={{
              background: 'none', border: 'none', color: COLORS.primary,
              cursor: 'pointer', padding: '0 2px', fontSize: '13px', lineHeight: 1,
            }}>×</button>
          </span>
        ))}
        {tags.length === 0 && (
          <span style={{ fontSize: '11px', color: COLORS.textMuted, fontStyle: 'italic' }}>Brak tagów — dodaj poniżej</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        <input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
          placeholder="Nowy tag..."
          style={{
            flex: 1, padding: '8px 10px', fontSize: '12px',
            background: COLORS.bgSecondary, border: `1px solid ${COLORS.border}`,
            borderRadius: '8px', color: COLORS.text, boxSizing: 'border-box',
          }}
        />
        <button type="button" onClick={addTag} disabled={!newTag.trim()} style={{
          padding: '8px 12px', fontSize: '12px', fontWeight: '500',
          background: newTag.trim() ? COLORS.primary : COLORS.bgSecondary,
          color: newTag.trim() ? '#fff' : COLORS.textMuted,
          border: 'none', borderRadius: '8px', cursor: newTag.trim() ? 'pointer' : 'default',
        }}>+</button>
      </div>
    </div>
  );
}

function TaskViewPanel({ task, onClose, navigate, api, projectId, setTasks, setError }) {
  const [members, setMembers] = useState([]);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (projectId) {
      api(`/projects/${projectId}/members`).then(setMembers).catch(() => setMembers([]));
    }
  }, [projectId]);

  const handleAssign = async (identityId) => {
    setAssigning(true);
    try {
      await api(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ assigned_to_id: identityId || null }),
      });
      // Refresh tasks
      if (projectId) {
        const updated = await api(`/projects/${projectId}/tasks`);
        setTasks(updated);
      }
    } catch (e) { if (!e.sessionExpired) setError(e.message); }
    finally { setAssigning(false); }
  };

  const phaseLabel = (status) => {
    if (status === 'completed') return { text: 'Zakończony', color: COLORS.success, icon: '✅' };
    if (status === 'in_progress') return { text: 'W trakcie', color: COLORS.warning, icon: '🔄' };
    return { text: 'Nie rozpoczęty', color: COLORS.textMuted, icon: '○' };
  };

  const statusLabel = {
    pending: { text: 'Oczekuje', color: COLORS.warning },
    in_progress: { text: 'W trakcie', color: COLORS.primary },
    completed: { text: 'Zakończone', color: COLORS.success },
    exported: { text: 'Wyeksportowane', color: COLORS.success },
  };
  const st = statusLabel[task.status] || statusLabel.pending;

  const progress = task.docs_total > 0 ? Math.round((task.docs_described / task.docs_total) * 100) : 0;
  const assignee = task.assigned_to;

  return (
    <>
      <div style={{
        padding: '16px', borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600' }}>{task.icon} {task.name}</h3>
        <button onClick={onClose} style={{
          background: COLORS.bgTertiary, border: 'none', borderRadius: '6px',
          color: COLORS.textMuted, cursor: 'pointer', width: '28px', height: '28px', fontSize: '14px',
        }}>×</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {/* Task info */}
        <div style={{ padding: '12px', background: COLORS.bgTertiary, borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Dane zadania</div>
          <InfoRow label="Okres" value={task.period_start && task.period_end ? `${task.period_start} — ${task.period_end}` : '—'} />
          <InfoRow label="Deadline" value={task.deadline || '—'} />
          <InfoRow label="Status" value={st.text} />
        </div>

        {/* Progress */}
        <div style={{ padding: '12px', background: COLORS.bgTertiary, borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Postęp</div>
          <div style={{ height: '6px', background: COLORS.border, borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: progress === 100 ? COLORS.success : COLORS.primary, transition: 'width 0.3s' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
            <span style={{ color: COLORS.textMuted }}>Dokumenty</span>
            <span style={{ fontWeight: '500' }}>{task.docs_described}/{task.docs_total} opisanych</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginTop: '4px' }}>
            <span style={{ color: COLORS.textMuted }}>Wyeksportowane</span>
            <span style={{ fontWeight: '500' }}>{task.docs_exported}/{task.docs_total}</span>
          </div>
        </div>

        {/* Phases */}
        <div style={{ padding: '12px', background: COLORS.bgTertiary, borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Fazy</div>
          {[
            { label: 'Import', status: task.import_status },
            { label: 'Opis', status: task.describe_status },
            { label: 'Eksport', status: task.export_status },
          ].map(phase => {
            const p = phaseLabel(phase.status);
            return (
              <div key={phase.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '12px' }}>
                <span style={{ color: COLORS.textMuted }}>{phase.label}</span>
                <span style={{ color: p.color, fontSize: '11px' }}>{p.icon} {p.text}</span>
              </div>
            );
          })}
        </div>

        {/* Assignee + delegation */}
        <div style={{ padding: '12px', background: COLORS.bgTertiary, borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Wykonawca</div>
          
          {assignee ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: `${COLORS.primary}30`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: '600', color: COLORS.primary,
              }}>
                {(assignee.first_name?.[0] || assignee.email[0]).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '500' }}>
                  {assignee.first_name && assignee.last_name
                    ? `${assignee.first_name} ${assignee.last_name}`
                    : assignee.email}
                </div>
                <div style={{ fontSize: '10px', color: COLORS.textMuted }}>{assignee.email}</div>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: COLORS.warning, marginBottom: '10px' }}>
              ⚠ Nieprzypisane — wybierz wykonawcę
            </div>
          )}

          <label style={{ display: 'block', fontSize: '11px', color: COLORS.textMuted, marginBottom: '4px' }}>
            Deleguj do:
          </label>
          <select
            value={task.assigned_to_id || ''}
            onChange={(e) => handleAssign(e.target.value)}
            disabled={assigning}
            style={{
              width: '100%', padding: '10px', fontSize: '12px',
              background: COLORS.bgSecondary, border: `1px solid ${COLORS.border}`,
              borderRadius: '8px', color: COLORS.text,
              cursor: assigning ? 'wait' : 'pointer',
              opacity: assigning ? 0.6 : 1,
            }}
          >
            <option value="">— Nieprzypisane —</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>
                {m.first_name && m.last_name ? `${m.first_name} ${m.last_name}` : m.email}
                {' '}({m.role})
              </option>
            ))}
          </select>
        </div>

        {/* Actions — path built from current URL path segments */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button onClick={() => {
            if (!navigate) return;
            const m = location.pathname.match(/\/entity\/([^/]+)\/project\/([^/]+)/);
            if (m) navigate(`/entity/${m[1]}/project/${m[2]}/task/${task.id}/document/new`);
          }} style={{
            padding: '10px 14px', fontSize: '13px', fontWeight: '500',
            border: `1px solid ${COLORS.border}`, borderRadius: '8px',
            background: COLORS.bgTertiary, color: COLORS.text, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>➕ Nowy dokument</button>
        </div>
      </div>
    </>
  );
}

function ProjectViewPanel({ data, onClose, navigate, activeTask, api, setError, setProjects, entityId }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [members, setMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('accountant');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState(null);
  const projType = PROJECT_TYPES[data.type] || { icon: '📁', label: data.type };
  const isArchived = data.is_archived;

  useEffect(() => {
    api(`/projects/${data.id}/members`).then(setMembers).catch(() => setMembers([]));
  }, [data.id]);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      const result = await api(`/projects/${data.id}/invite`, {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      setMembers(prev => [...prev, { ...result.identity, source: 'authorization' }]);
      setInviteEmail('');
      setInviteMsg({ ok: true, text: `Zaproszono ${result.identity.email} jako ${inviteRole}` });
      setTimeout(() => setInviteMsg(null), 4000);
    } catch (e) {
      if (!e.sessionExpired) setInviteMsg({ ok: false, text: e.message });
    }
    finally { setInviting(false); }
  };

  const handleArchive = async () => {
    setBusy(true);
    try {
      await api(`/projects/${data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_archived: !isArchived, is_active: isArchived }),
      });
      // Refresh project list then navigate
      if (setProjects && entityId) {
        const updated = await api(`/projects?entity_id=${entityId}`);
        setProjects(updated);
      }
      navigate && navigate(`/entity/${data.entity_id}`);
    } catch (e) { if (!e.sessionExpired) setError(e.message); }
    finally { setBusy(false); }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await api(`/projects/${data.id}`, { method: 'DELETE' });
      // Remove from local state then navigate
      if (setProjects) {
        setProjects(prev => prev.filter(p => p.id !== data.id));
      }
      navigate && navigate(`/entity/${data.entity_id}`);
    } catch (e) { if (!e.sessionExpired) setError(e.message); }
    finally { setBusy(false); setConfirmDelete(false); }
  };

  return (
    <>
      <div style={{
        padding: '16px', borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600' }}>{projType.icon} {data.name}</h3>
        <button onClick={onClose} style={{
          background: COLORS.bgTertiary, border: 'none', borderRadius: '6px',
          color: COLORS.textMuted, cursor: 'pointer', width: '28px', height: '28px', fontSize: '14px',
        }}>×</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        <div style={{ padding: '12px', background: COLORS.bgTertiary, borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Dane projektu</div>
          <InfoRow label="Typ" value={`${projType.icon} ${projType.label}`} />
          <InfoRow label="Rok" value={data.year} />
          <InfoRow label="Okres" value={data.period_start && data.period_end ? `${data.period_start} — ${data.period_end}` : '—'} />
          <InfoRow label="Status" value={isArchived ? '📦 Zarchiwizowany' : data.is_active ? '🟢 Aktywny' : '⚪ Nieaktywny'} />
        </div>
        {activeTask && (
          <div style={{ padding: '12px', background: COLORS.bgTertiary, borderRadius: '8px', marginBottom: '16px' }}>
            <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Aktywne zadanie</div>
            <InfoRow label="Nazwa" value={`${activeTask.icon} ${activeTask.name}`} />
            <InfoRow label="Dokumenty" value={`${activeTask.docs_described}/${activeTask.docs_total} opisanych`} />
            <InfoRow label="Status" value={activeTask.status} />
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button onClick={() => navigate && navigate(`/entity/${data.entity_id}/project/${data.id}/sources`)} style={{
            padding: '10px 14px', fontSize: '13px', fontWeight: '500',
            border: `1px solid ${COLORS.border}`, borderRadius: '8px',
            background: COLORS.bgTertiary, color: COLORS.text, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>⚙️ Źródła danych</button>
          <button onClick={() => navigate && navigate(`/entity/${data.entity_id}/project/${data.id}/task/new`)} style={{
            padding: '10px 14px', fontSize: '13px', fontWeight: '500',
            border: `1px solid ${COLORS.border}`, borderRadius: '8px',
            background: COLORS.bgTertiary, color: COLORS.text, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>📋 Nowe zadanie</button>
        </div>

        {/* Share / Invite section */}
        <div style={{
          marginTop: '24px', paddingTop: '16px',
          borderTop: `1px solid ${COLORS.border}`,
        }}>
          <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: '10px', textTransform: 'uppercase', fontWeight: '600' }}>
            Udostępnij projekt
          </div>

          {/* Current members */}
          <div style={{ marginBottom: '12px' }}>
            {members.map(m => (
              <div key={m.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '6px 8px', borderRadius: '6px',
                background: COLORS.bgTertiary, marginBottom: '4px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <span style={{
                    width: '24px', height: '24px', borderRadius: '50%',
                    background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '10px', color: '#fff', fontWeight: '600', flexShrink: 0,
                  }}>
                    {(m.first_name?.[0] || m.email?.[0] || '?').toUpperCase()}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.first_name && m.last_name ? `${m.first_name} ${m.last_name}` : m.email}
                    </div>
                    <div style={{ fontSize: '10px', color: COLORS.textMuted }}>
                      {m.source === 'member' ? '👤 Członek' : '🔑 Autoryzowany'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {members.length === 0 && (
              <div style={{ fontSize: '11px', color: COLORS.textMuted, fontStyle: 'italic' }}>Brak osób</div>
            )}
          </div>

          {/* Invite form */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <input
              type="email"
              placeholder="Email osoby do zaproszenia..."
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleInvite()}
              style={{
                width: '100%', padding: '8px 10px', fontSize: '12px',
                background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
                borderRadius: '8px', color: COLORS.text, boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: '6px' }}>
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                style={{
                  flex: 1, padding: '8px 6px', fontSize: '11px',
                  background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
                  borderRadius: '8px', color: COLORS.text,
                }}
              >
                <option value="accountant">Księgowa</option>
                <option value="assistant">Asystent</option>
                <option value="viewer">Podgląd</option>
              </select>
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim()}
                style={{
                  padding: '8px 14px', fontSize: '12px', fontWeight: '500',
                  background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
                  border: 'none', borderRadius: '8px', color: '#fff',
                  cursor: inviting || !inviteEmail.trim() ? 'default' : 'pointer',
                  opacity: inviting || !inviteEmail.trim() ? 0.5 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {inviting ? '...' : 'Zaproś'}
              </button>
            </div>
            {inviteMsg && (
              <div style={{
                padding: '6px 10px', fontSize: '11px', borderRadius: '6px',
                background: inviteMsg.ok ? `${COLORS.success}15` : '#ef444415',
                color: inviteMsg.ok ? COLORS.success : '#ef4444',
                border: `1px solid ${inviteMsg.ok ? COLORS.success + '40' : '#ef444440'}`,
              }}>
                {inviteMsg.text}
              </div>
            )}
          </div>
        </div>

        {/* Archive / Delete section */}
        <div style={{
          marginTop: '24px', paddingTop: '16px',
          borderTop: `1px solid ${COLORS.border}`,
        }}>
          <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: '10px', textTransform: 'uppercase', fontWeight: '600' }}>
            Zarządzanie projektem
          </div>
          <button
            onClick={handleArchive}
            disabled={busy}
            style={{
              width: '100%', padding: '10px 14px', fontSize: '13px', fontWeight: '500',
              border: `1px solid ${isArchived ? COLORS.success + '40' : '#f59e0b40'}`,
              borderRadius: '8px', cursor: busy ? 'wait' : 'pointer',
              background: isArchived ? `${COLORS.success}10` : '#f59e0b10',
              color: isArchived ? COLORS.success : '#f59e0b',
              display: 'flex', alignItems: 'center', gap: '8px',
              marginBottom: '8px',
            }}
          >
            {isArchived ? '♻️ Przywróć z archiwum' : '📦 Archiwizuj projekt'}
          </button>

          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              style={{
                width: '100%', padding: '10px 14px', fontSize: '13px', fontWeight: '500',
                border: `1px solid #ef444440`,
                borderRadius: '8px', cursor: busy ? 'wait' : 'pointer',
                background: '#ef444410',
                color: '#ef4444',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}
            >
              🗑️ Usuń projekt
            </button>
          ) : (
            <div style={{
              padding: '12px', background: '#ef444415',
              border: '1px solid #ef444440', borderRadius: '8px',
            }}>
              <div style={{ fontSize: '12px', color: '#ef4444', fontWeight: '600', marginBottom: '8px' }}>
                Czy na pewno chcesz usunąć ten projekt?
              </div>
              <div style={{ fontSize: '11px', color: COLORS.textMuted, marginBottom: '12px' }}>
                Zostaną usunięte wszystkie zadania i dokumenty. Tej operacji nie można cofnąć.
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleDelete}
                  disabled={busy}
                  style={{
                    flex: 1, padding: '8px', fontSize: '12px', fontWeight: '600',
                    background: '#ef4444', color: '#fff',
                    border: 'none', borderRadius: '6px',
                    cursor: busy ? 'wait' : 'pointer',
                  }}
                >
                  {busy ? '...' : 'Tak, usuń'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={busy}
                  style={{
                    flex: 1, padding: '8px', fontSize: '12px', fontWeight: '500',
                    background: COLORS.bgTertiary, color: COLORS.textMuted,
                    border: `1px solid ${COLORS.border}`, borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Anuluj
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function DocumentViewPanel({ doc, onClose, api, setDocuments, setError, projectTags = [], navigate, entityId, activeProject }) {
  const isCV = activeProject?.type === 'rekrutacja';
  const meta = doc.metadata || {};
  const [description, setDescription] = useState(meta.description || '');
  const [category, setCategory] = useState(meta.category || '');
  const [tags, setTags] = useState(meta.tags || []);
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [duplicates, setDuplicates] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    const m = doc.metadata || {};
    setDescription(m.description || '');
    setCategory(m.category || '');
    setTags(m.tags || []);
  }, [doc.id]);

  useEffect(() => {
    if (doc.doc_id) {
      api(`/documents/${doc.id}/duplicates`).then(setDuplicates).catch(() => setDuplicates([]));
    } else {
      setDuplicates([]);
    }
  }, [doc.id]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await api(`/documents/${doc.id}/metadata`, {
        method: 'PATCH',
        body: JSON.stringify({ category, description, tags }),
      });
      if (setDocuments) {
        setDocuments(prev => prev.map(d => d.id === doc.id ? updated : d));
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) { if (!e.sessionExpired) setError(e.message); }
    finally { setSaving(false); }
  };

  const addTag = () => {
    const t = newTag.trim();
    if (t && !tags.includes(t)) {
      setTags(prev => [...prev, t]);
      setNewTag('');
    }
  };

  const removeTag = (tag) => {
    setTags(prev => prev.filter(t => t !== tag));
  };

  const statusColors = {
    new: { bg: '#3b82f620', color: '#3b82f6', label: isCV ? 'Nowe CV' : 'Nowy' },
    described: { bg: '#f59e0b20', color: '#f59e0b', label: isCV ? 'Oceniony' : 'Opisany' },
    approved: { bg: '#10b98120', color: '#10b981', label: isCV ? 'Zatwierdzony' : 'Zatwierdzony' },
    exported: { bg: '#8b5cf620', color: '#8b5cf6', label: isCV ? 'Zamknięty' : 'Wyeksportowany' },
  };
  const st = statusColors[doc.status] || statusColors.new;

  return (
    <>
      <div style={{
        padding: '16px', borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600' }}>{isCV ? '👤' : '📄'} {isCV ? (doc.contractor_name || doc.number || 'Kandydat') : (doc.number || 'Dokument')}</h3>
        <button onClick={onClose} style={{
          background: COLORS.bgTertiary, border: 'none', borderRadius: '6px',
          color: COLORS.textMuted, cursor: 'pointer', width: '28px', height: '28px', fontSize: '14px',
        }}>×</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {/* Document info (read-only) */}
        <div style={{ padding: '12px', background: COLORS.bgTertiary, borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>{isCV ? 'Dane kandydata' : 'Dane dokumentu'}</div>
          {isCV ? (
            <>
              <InfoRow label="Kandydat" value={doc.contractor_name || '—'} />
              <InfoRow label="Email / Telefon" value={doc.contractor_nip || '—'} />
              <InfoRow label="Plik" value={doc.number || '—'} />
              <InfoRow label="Data otrzymania" value={doc.document_date || '—'} />
            </>
          ) : (
            <>
              <InfoRow label="Numer" value={doc.number || '—'} />
              <InfoRow label="Kontrahent" value={doc.contractor_name || '—'} />
              <InfoRow label="NIP" value={doc.contractor_nip || '—'} />
              <InfoRow label="Kwota brutto" value={doc.amount_gross ? `${doc.amount_gross.toLocaleString('pl-PL')} ${doc.currency || 'PLN'}` : '—'} />
              <InfoRow label="Data" value={doc.document_date || '—'} />
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
            <span style={{ fontSize: '11px', color: COLORS.textMuted }}>Status</span>
            <span style={{
              fontSize: '10px', fontWeight: '600', padding: '2px 8px',
              borderRadius: '4px', background: st.bg, color: st.color,
            }}>{st.label}</span>
          </div>
        </div>

        {/* Doc ID badge */}
        {doc.doc_id && (
          <div style={{
            padding: '8px 12px', background: COLORS.bgTertiary, borderRadius: '8px',
            marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span style={{ fontSize: '10px', color: COLORS.textMuted }}>🔑 ID:</span>
            <code style={{
              fontSize: '10px', fontFamily: 'monospace', color: COLORS.primary,
              background: `${COLORS.primary}10`, padding: '2px 6px', borderRadius: '4px',
            }}>{doc.doc_id}</code>
          </div>
        )}

        {/* Duplicate warning */}
        {duplicates.length > 0 && (
          <div style={{
            padding: '10px 12px', background: '#f59e0b15', border: '1px solid #f59e0b40',
            borderRadius: '8px', marginBottom: '16px',
          }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#f59e0b', marginBottom: '6px' }}>
              ⚠️ Wykryto {duplicates.length} {duplicates.length === 1 ? 'duplikat' : 'duplikaty'}
            </div>
            {duplicates.map(d => (
              <div key={d.id}
                onClick={() => navigate && entityId && d.project_id && d.task_id && navigate(`/entity/${entityId}/project/${d.project_id}/task/${d.task_id}/document/${d.id}`)}
                style={{
                  fontSize: '11px', color: COLORS.textMuted, padding: '5px 6px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderRadius: '6px', cursor: navigate ? 'pointer' : 'default',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#f59e0b15'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                title="Przejdź do duplikatu"
              >
                <span>{d.number || '—'} • {d.contractor_name || '—'}</span>
                <span style={{ fontSize: '10px', opacity: 0.7, display: 'flex', alignItems: 'center', gap: '4px' }}>{d.source || '—'} →</span>
              </div>
            ))}
          </div>
        )}

        {/* Category */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '11px', color: COLORS.textMuted, marginBottom: '4px', textTransform: 'uppercase' }}>{isCV ? 'Stanowisko' : 'Kategoria'}</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder={isCV ? 'np. Frontend Developer, QA Engineer...' : 'np. IT - Hosting, Biuro, Marketing...'}
            style={{
              width: '100%', padding: '10px 12px', fontSize: '13px',
              background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
              borderRadius: '8px', color: COLORS.text, boxSizing: 'border-box',
            }}
          />
          {projectTags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
              {projectTags.map(pt => (
                <button key={pt} type="button" onClick={() => setCategory(pt)} style={{
                  padding: '3px 8px', fontSize: '10px', fontWeight: '500',
                  background: category === pt ? `${COLORS.primary}20` : COLORS.bgTertiary,
                  color: category === pt ? COLORS.primary : COLORS.textMuted,
                  border: `1px solid ${category === pt ? COLORS.primary + '40' : COLORS.border}`,
                  borderRadius: '10px', cursor: 'pointer',
                }}>{pt}</button>
              ))}
            </div>
          )}
        </div>

        {/* Tags */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '11px', color: COLORS.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>{isCV ? 'Umiejętności' : 'Tagi'}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
            {tags.map(tag => (
              <span key={tag} style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '4px 10px', fontSize: '11px', fontWeight: '500',
                background: `${COLORS.primary}20`, color: COLORS.primary,
                borderRadius: '12px',
              }}>
                {tag}
                <button onClick={() => removeTag(tag)} style={{
                  background: 'none', border: 'none', color: COLORS.primary,
                  cursor: 'pointer', padding: '0 2px', fontSize: '13px', lineHeight: 1,
                }}>×</button>
              </span>
            ))}
            {tags.length === 0 && (
              <span style={{ fontSize: '11px', color: COLORS.textMuted, fontStyle: 'italic' }}>Brak tagów</span>
            )}
          </div>
          {projectTags.length > 0 && (() => {
            const available = projectTags.filter(pt => !tags.includes(pt));
            if (available.length === 0) return null;
            return (
              <>
                <div style={{ fontSize: '9px', color: COLORS.textMuted, marginBottom: '4px', textTransform: 'uppercase' }}>Dodaj z projektu:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                  {available.map(pt => (
                    <button key={pt} type="button" onClick={() => setTags(prev => [...prev, pt])} style={{
                      padding: '3px 8px', fontSize: '10px', fontWeight: '500',
                      background: COLORS.bgTertiary, color: COLORS.textMuted,
                      border: `1px dashed ${COLORS.border}`, borderRadius: '10px',
                      cursor: 'pointer',
                    }}>+ {pt}</button>
                  ))}
                </div>
              </>
            );
          })()}
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
              placeholder={isCV ? 'Dodaj umiejętność...' : 'Dodaj tag...'}
              style={{
                flex: 1, padding: '8px 10px', fontSize: '12px',
                background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
                borderRadius: '8px', color: COLORS.text, boxSizing: 'border-box',
              }}
            />
            <button onClick={addTag} disabled={!newTag.trim()} style={{
              padding: '8px 12px', fontSize: '12px', fontWeight: '500',
              background: newTag.trim() ? COLORS.primary : COLORS.bgTertiary,
              color: newTag.trim() ? '#fff' : COLORS.textMuted,
              border: 'none', borderRadius: '8px', cursor: newTag.trim() ? 'pointer' : 'default',
            }}>+</button>
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '11px', color: COLORS.textMuted, marginBottom: '4px', textTransform: 'uppercase' }}>{isCV ? 'Notatki' : 'Opis'}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={isCV ? 'Notatki o kandydacie, wrażenia z rozmowy...' : 'Dodaj opis dokumentu...'}
            style={{
              width: '100%', padding: '10px 12px', fontSize: '13px',
              background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
              borderRadius: '8px', color: COLORS.text,
              minHeight: '100px', resize: 'vertical',
              fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Save + Delete buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              width: '100%', padding: '12px', fontSize: '14px', fontWeight: '500',
              background: saved ? COLORS.success : `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
              border: 'none', borderRadius: '8px', color: '#fff',
              cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
              transition: 'background 0.3s',
            }}
          >
            {saving ? '...' : saved ? '✓ Zapisano' : 'Zapisz metadane'}
          </button>
          {deleteError && (
            <div style={{
              padding: '8px 12px', fontSize: '12px', color: '#ef4444',
              background: '#ef444415', border: '1px solid #ef444440',
              borderRadius: '8px',
            }}>
              {deleteError}
            </div>
          )}
          {!confirmDelete ? (
            <button
              onClick={() => { setConfirmDelete(true); setDeleteError(null); }}
              style={{
                width: '100%', padding: '10px', fontSize: '12px', fontWeight: '500',
                background: 'transparent', border: `1px solid ${COLORS.border}`,
                borderRadius: '8px', color: COLORS.textMuted, cursor: 'pointer',
              }}
            >
              🗑️ Usuń dokument
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={async () => {
                  setDeleting(true);
                  setDeleteError(null);
                  try {
                    await api(`/documents/${doc.id}`, { method: 'DELETE' });
                    if (setDocuments) {
                      setDocuments(prev => prev.filter(d => d.id !== doc.id));
                    }
                    onClose();
                  } catch (e) {
                    if (!e.sessionExpired) {
                      setDeleteError(e.message);
                      setError(e.message);
                    }
                  }
                  finally { setDeleting(false); setConfirmDelete(false); }
                }}
                disabled={deleting}
                style={{
                  flex: 1, padding: '10px', fontSize: '12px', fontWeight: '600',
                  background: '#ef444420', border: '1px solid #ef444460',
                  borderRadius: '8px', color: '#ef4444', cursor: deleting ? 'wait' : 'pointer',
                }}
              >
                {deleting ? '...' : 'Potwierdź usunięcie'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  padding: '10px 16px', fontSize: '12px', fontWeight: '500',
                  background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
                  borderRadius: '8px', color: COLORS.textMuted, cursor: 'pointer',
                }}
              >
                Anuluj
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTIVITY PANELS
// ═══════════════════════════════════════════════════════════════════════════════

function ActivityTabbedPanel({ activeTab, data, onClose, api, setDocuments, setSources, setError, token, navigate, onCreateDocument, loading, selectedDocs, setSelectedDocs, activeProject }) {
  const dupCount = (() => {
    const ids = {};
    (data.documents || []).forEach(d => { if (d.doc_id) ids[d.doc_id] = (ids[d.doc_id] || 0) + 1; });
    return Object.values(ids).filter(c => c > 1).reduce((s, c) => s + c, 0);
  })();

  const TABS = [
    { id: 'activity-import', label: 'Import', icon: '📥', suffix: '/import' },
    { id: 'activity-selected', label: `Zaznaczone${selectedDocs?.length ? ` (${selectedDocs.length})` : ''}`, icon: '☑️', suffix: '/selected' },
    { id: 'activity-duplicates', label: `Duplikaty${dupCount ? ` (${dupCount})` : ''}`, icon: '⚠️', suffix: '/duplicates' },
    { id: 'activity-export', label: 'Eksport', icon: '📤', suffix: '/export' },
    { id: 'new-document', label: 'Nowy', icon: '➕', suffix: '/document/new' },
  ];

  const basePath = location.pathname.replace(/\/(import|selected|describe|export|duplicates|document\/new)$/, '');

  return (
    <>
      {/* Tab bar */}
      <div style={{
        display: 'flex', alignItems: 'stretch',
        borderBottom: `1px solid ${COLORS.border}`,
        background: COLORS.bgSecondary,
      }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id}
              onClick={() => navigate(basePath + tab.suffix)}
              style={{
                flex: 1, padding: '11px 6px',
                background: 'transparent', border: 'none',
                borderBottom: isActive ? `2px solid ${COLORS.primary}` : '2px solid transparent',
                color: isActive ? COLORS.primary : COLORS.textMuted,
                cursor: 'pointer', fontSize: '12px', fontWeight: isActive ? '600' : '400',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: '13px' }}>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
        <button onClick={onClose} style={{
          background: 'transparent', border: 'none', borderBottom: '2px solid transparent',
          color: COLORS.textMuted, cursor: 'pointer', width: '36px',
          fontSize: '14px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>×</button>
      </div>
      {/* Active panel content */}
      {activeTab === 'activity-import' && (
        <ImportPanel data={data} api={api} setDocuments={setDocuments} setSources={setSources} setError={setError} token={token} navigate={navigate} />
      )}
      {activeTab === 'activity-selected' && (
        <BulkEditPanel data={data} api={api} setDocuments={setDocuments} setError={setError} selectedDocs={selectedDocs} setSelectedDocs={setSelectedDocs} navigate={navigate} activeProject={activeProject} />
      )}
      {activeTab === 'activity-duplicates' && (
        <DuplicatesPanel data={data} api={api} setDocuments={setDocuments} setError={setError} navigate={navigate} />
      )}
      {activeTab === 'activity-export' && (
        <ExportPanel data={data} api={api} setDocuments={setDocuments} setSources={setSources} setError={setError} navigate={navigate} />
      )}
      {activeTab === 'new-document' && (
        <NewDocumentPanel onCreateDocument={onCreateDocument} loading={loading} />
      )}
    </>
  );
}

function DuplicatesPanel({ data, api, setDocuments, setError, navigate }) {
  const { task, documents } = data;
  const [groups, setGroups] = useState([]);
  const [totalDups, setTotalDups] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const fetchDuplicates = async () => {
    setLoading(true);
    try {
      const res = await api(`/tasks/${task.id}/duplicates`);
      setGroups(res.groups || []);
      setTotalDups(res.total_duplicates || 0);
    } catch (e) {
      if (!e.sessionExpired) setError(e.message);
      setGroups([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchDuplicates(); }, [task.id]);

  const handleDelete = async (docId) => {
    setDeleting(docId);
    try {
      await api(`/documents/${docId}`, { method: 'DELETE' });
      const updated = await api(`/tasks/${task.id}/documents`);
      setDocuments(updated);
      await fetchDuplicates();
      setConfirmDelete(null);
    } catch (e) {
      if (!e.sessionExpired) setError(e.message);
    }
    setDeleting(null);
  };

  const handleDeleteAllDuplicates = async (group) => {
    const toDelete = group.documents.slice(1);
    setDeleting('bulk');
    try {
      for (const doc of toDelete) {
        await api(`/documents/${doc.id}`, { method: 'DELETE' });
      }
      const updated = await api(`/tasks/${task.id}/documents`);
      setDocuments(updated);
      await fetchDuplicates();
    } catch (e) {
      if (!e.sessionExpired) setError(e.message);
    }
    setDeleting(null);
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
        <div style={{ color: COLORS.textMuted, fontSize: '13px' }}>Szukam duplikatów...</div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px', gap: '8px' }}>
        <div style={{ fontSize: '32px' }}>✅</div>
        <div style={{ fontSize: '14px', fontWeight: '500', color: COLORS.text }}>Brak duplikatów</div>
        <div style={{ fontSize: '12px', color: COLORS.textMuted, textAlign: 'center' }}>
          Wszystkie dokumenty w tym zadaniu mają unikalne identyfikatory (doc_id).
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
      <div style={{
        padding: '12px', background: `${COLORS.warning}15`, borderRadius: '8px', marginBottom: '16px',
        border: `1px solid ${COLORS.warning}30`,
      }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: COLORS.warning, marginBottom: '4px' }}>
          ⚠️ Znaleziono {totalDups} {totalDups === 1 ? 'duplikat' : totalDups < 5 ? 'duplikaty' : 'duplikatów'}
        </div>
        <div style={{ fontSize: '11px', color: COLORS.textMuted }}>
          {groups.length} {groups.length === 1 ? 'grupa' : groups.length < 5 ? 'grupy' : 'grup'} dokumentów z tym samym identyfikatorem.
          Pierwszy dokument w każdej grupie to oryginał.
        </div>
      </div>

      {groups.map((group, gi) => (
        <div key={group.doc_id} style={{
          marginBottom: '12px', borderRadius: '8px',
          border: `1px solid ${COLORS.border}`, overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 12px', background: COLORS.bgTertiary,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: `1px solid ${COLORS.border}`,
          }}>
            <div>
              <div style={{ fontSize: '11px', color: COLORS.textMuted, fontFamily: 'monospace' }}>
                {group.doc_id}
              </div>
              <div style={{ fontSize: '12px', fontWeight: '500', marginTop: '2px' }}>
                {group.documents.length} dokumentów
              </div>
            </div>
            {group.documents.length > 1 && (
              <button
                onClick={() => handleDeleteAllDuplicates(group)}
                disabled={deleting === 'bulk'}
                style={{
                  padding: '4px 10px', fontSize: '10px', borderRadius: '6px',
                  border: `1px solid ${COLORS.danger}40`, background: `${COLORS.danger}10`,
                  color: COLORS.danger, cursor: deleting === 'bulk' ? 'wait' : 'pointer',
                  fontWeight: '500',
                }}
              >
                {deleting === 'bulk' ? '...' : 'Usuń duplikaty'}
              </button>
            )}
          </div>

          {group.documents.map((doc, di) => {
            const isOriginal = di === 0;
            const isConfirming = confirmDelete === doc.id;
            return (
              <div key={doc.id} style={{
                padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px',
                borderBottom: di < group.documents.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                background: isOriginal ? `${COLORS.success}08` : `${COLORS.warning}08`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isOriginal ? (
                      <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: `${COLORS.success}20`, color: COLORS.success, fontWeight: '600' }}>
                        Oryginał
                      </span>
                    ) : (
                      <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: `${COLORS.warning}20`, color: COLORS.warning, fontWeight: '600' }}>
                        Duplikat
                      </span>
                    )}
                    <span style={{ fontSize: '12px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.number || '—'}
                    </span>
                  </div>
                  <div style={{ fontSize: '10px', color: COLORS.textMuted, marginTop: '3px', display: 'flex', gap: '8px' }}>
                    <span>{doc.contractor_name || '—'}</span>
                    <span>{doc.amount_gross ? `${doc.amount_gross.toLocaleString('pl-PL')} ${doc.currency || 'PLN'}` : ''}</span>
                    <span>{doc.document_date || ''}</span>
                  </div>
                  <div style={{ fontSize: '9px', color: COLORS.textMuted, marginTop: '2px' }}>
                    Źródło: {doc.source || '—'} · ID: {doc.id.slice(0, 8)}
                  </div>
                </div>

                {!isOriginal && (
                  <div style={{ flexShrink: 0, display: 'flex', gap: '4px' }}>
                    {isConfirming ? (
                      <>
                        <button onClick={() => handleDelete(doc.id)}
                          disabled={deleting === doc.id}
                          style={{
                            padding: '4px 8px', fontSize: '10px', borderRadius: '4px',
                            border: 'none', background: COLORS.danger, color: '#fff',
                            cursor: deleting === doc.id ? 'wait' : 'pointer', fontWeight: '600',
                          }}>
                          {deleting === doc.id ? '...' : 'Potwierdź'}
                        </button>
                        <button onClick={() => setConfirmDelete(null)}
                          style={{
                            padding: '4px 8px', fontSize: '10px', borderRadius: '4px',
                            border: `1px solid ${COLORS.border}`, background: 'transparent',
                            color: COLORS.textMuted, cursor: 'pointer',
                          }}>
                          Anuluj
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmDelete(doc.id)}
                        style={{
                          padding: '4px 8px', fontSize: '10px', borderRadius: '4px',
                          border: `1px solid ${COLORS.danger}40`, background: 'transparent',
                          color: COLORS.danger, cursor: 'pointer',
                        }}>
                        🗑️ Usuń
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}


function NewDocumentPanel({ onCreateDocument, loading }) {
  const [formData, setFormData] = useState({});
  const update = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    onCreateDocument(formData);
  };

  return (
    <>
      <form onSubmit={handleSubmit} style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        <InputField label="Numer dokumentu" value={formData.number || ''} onChange={(v) => update('number', v)} />
        <InputField label="Kontrahent" value={formData.contractor_name || ''} onChange={(v) => update('contractor_name', v)} />
        <InputField label="NIP kontrahenta" value={formData.contractor_nip || ''} onChange={(v) => update('contractor_nip', v)} />
        <InputField label="Kwota netto" value={formData.amount_net || ''} onChange={(v) => update('amount_net', parseFloat(v) || null)} type="number" />
        <InputField label="VAT" value={formData.amount_vat || ''} onChange={(v) => update('amount_vat', parseFloat(v) || null)} type="number" />
        <InputField label="Kwota brutto" value={formData.amount_gross || ''} onChange={(v) => update('amount_gross', parseFloat(v) || null)} type="number" />
        <InputField label="Data dokumentu" value={formData.document_date || ''} onChange={(v) => update('document_date', v)} type="date" />
      </form>
      <div style={{ padding: '16px', borderTop: `1px solid ${COLORS.border}` }}>
        <button onClick={handleSubmit} disabled={loading}
          style={{
            width: '100%', padding: '12px',
            background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
            border: 'none', borderRadius: '8px', color: '#fff',
            fontSize: '14px', fontWeight: '500',
            cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
          }}>
          {loading ? '...' : 'Utwórz'}
        </button>
      </div>
    </>
  );
}

function ImportPanel({ data, api, setDocuments, setSources, setError, token, navigate }) {
  const { task, sources, documents, projectId } = data;
  const [importing, setImporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [editingSource, setEditingSource] = useState(null);
  const [editConfig, setEditConfig] = useState({});
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState(null);
  const [newName, setNewName] = useState('');
  const [newConfig, setNewConfig] = useState({});
  const fileInputRef = React.useRef(null);

  const importSources = sources.filter(s => s.direction === 'import');
  const docsTotal = documents.length;

  const refreshSources = async () => {
    if (!projectId || !setSources) return;
    try {
      const updated = await api(`/projects/${projectId}/sources`);
      setSources(updated);
    } catch (e) {}
  };

  const handleImport = async (source) => {
    setImporting(true);
    try {
      await api('/flow/import', {
        method: 'POST',
        body: JSON.stringify({ source_id: source.id, task_id: task.id }),
      });
      const docs = await api(`/tasks/${task.id}/documents`);
      setDocuments(docs);
    } catch (e) { if (!e.sessionExpired) setError(e.message); }
    finally { setImporting(false); }
  };

  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_URL}/flow/upload-csv?task_id=${task.id}`, {
        method: 'POST',
        headers: { ...(token && { 'Authorization': `Bearer ${token}` }) },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Błąd uploadu' }));
        throw new Error(err.detail || 'Błąd');
      }
      const result = await res.json();
      setUploadResult(result);
      const docs = await api(`/tasks/${task.id}/documents`);
      setDocuments(docs);
      setTimeout(() => setUploadResult(null), 5000);
    } catch (e) { if (!e.sessionExpired) setError(e.message); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const openEditor = (src) => {
    setAdding(false);
    setEditingSource(src.id === editingSource ? null : src.id);
    setEditConfig({ ...(src.config || {}) });
    setEditName(src.name);
    setTestResult(null);
  };

  const handleSaveConfig = async (src) => {
    setSaving(true);
    try {
      await api(`/sources/${src.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editName, config: editConfig }),
      });
      setEditingSource(null);
      await refreshSources();
    } catch (e) { if (!e.sessionExpired) setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDeleteSource = async (src) => {
    setSaving(true);
    try {
      await api(`/sources/${src.id}`, { method: 'DELETE' });
      setEditingSource(null);
      await refreshSources();
    } catch (e) { if (!e.sessionExpired) setError(e.message); }
    finally { setSaving(false); }
  };

  const handleTestConnection = async (src) => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api(`/sources/${src.id}/test-connection`, { method: 'POST' });
      setTestResult(result);
    } catch (e) {
      setTestResult({ ok: false, message: e.message });
    }
    finally { setTesting(false); }
  };

  const handleAddSource = async () => {
    if (!newType || !newName || !projectId) return;
    setSaving(true);
    try {
      await api(`/projects/${projectId}/sources`, {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          direction: 'import',
          source_type: newType.type,
          name: newName,
          config: newConfig,
        }),
      });
      setAdding(false);
      setNewType(null);
      setNewName('');
      setNewConfig({});
      await refreshSources();
    } catch (e) { if (!e.sessionExpired) setError(e.message); }
    finally { setSaving(false); }
  };

  const IMPORT_TYPES = [
    { type: 'email', name: 'Email (IMAP)', icon: '📧' },
    { type: 'ksef', name: 'KSeF', icon: '🏛️' },
    { type: 'upload', name: 'Upload plików', icon: '📤' },
    { type: 'webhook', name: 'Webhook', icon: '🔗' },
    { type: 'csv', name: 'Import CSV', icon: '📄' },
    { type: 'manual', name: 'Ręczne dodawanie', icon: '✏️' },
    { type: 'bank', name: 'Raport bankowy', icon: '🏦' },
    { type: 'bank_ing', name: 'ING Bank Śląski', icon: '🟠' },
    { type: 'bank_mbank', name: 'mBank', icon: '🔴' },
    { type: 'bank_pko', name: 'PKO BP', icon: '🔵' },
    { type: 'bank_santander', name: 'Santander', icon: '🔴' },
    { type: 'bank_pekao', name: 'Bank Pekao', icon: '🟡' },
  ];

  const EMAIL_FIELDS = [
    { key: 'host', label: 'Serwer IMAP', placeholder: 'imap.example.pl' },
    { key: 'port', label: 'Port', placeholder: '993', type: 'number' },
    { key: 'username', label: 'Użytkownik', placeholder: 'user@example.pl' },
    { key: 'password', label: 'Hasło', placeholder: '••••••••', type: 'password' },
    { key: 'folder', label: 'Folder', placeholder: 'INBOX/Faktury' },
    { key: 'days_back', label: 'Dni wstecz', placeholder: '30', type: 'number' },
  ];
  const KSEF_FIELDS = [
    { key: 'nip', label: 'NIP', placeholder: '1234567890' },
    { key: 'token', label: 'Token autoryzacji', placeholder: 'token...', type: 'password' },
    { key: 'environment', label: 'Środowisko', placeholder: 'test', options: ['test', 'demo', 'prod'] },
  ];

  const configFields = (srcType) => {
    if (srcType === 'email') return EMAIL_FIELDS;
    if (srcType === 'ksef') return KSEF_FIELDS;
    return [];
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', background: COLORS.bgSecondary,
    border: `1px solid ${COLORS.border}`, borderRadius: '6px',
    color: COLORS.text, fontSize: '12px', boxSizing: 'border-box',
  };

  const renderConfigFields = (fields, config, setConfig) => fields.map(f => (
    <div key={f.key} style={{ marginBottom: '10px' }}>
      <label style={{ display: 'block', fontSize: '11px', color: COLORS.textMuted, marginBottom: '4px' }}>{f.label}</label>
      {f.options ? (
        <select value={config[f.key] || ''} onChange={(e) => setConfig(prev => ({ ...prev, [f.key]: e.target.value }))}
          style={inputStyle}>
          <option value="">—</option>
          {f.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={f.type || 'text'} value={config[f.key] || ''}
          onChange={(e) => setConfig(prev => ({ ...prev, [f.key]: e.target.value }))}
          placeholder={f.placeholder} style={inputStyle} />
      )}
    </div>
  ));

  return (
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        <div style={{ padding: '12px', background: COLORS.bgTertiary, borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Podsumowanie</div>
          <InfoRow label="Zadanie" value={`${task.icon} ${task.name}`} />
          <InfoRow label="Dokumenty" value={`${docsTotal} łącznie`} />
          <InfoRow label="Źródła importu" value={`${importSources.length}`} />
        </div>

        {/* Source list */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            fontSize: '10px', color: COLORS.textMuted, marginBottom: '8px', textTransform: 'uppercase', fontWeight: '600',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>Źródła importu</span>
            <button onClick={() => { setAdding(!adding); setEditingSource(null); setNewType(null); setNewName(''); setNewConfig({}); }}
              style={{ background: 'transparent', border: 'none', color: COLORS.primary, cursor: 'pointer', fontSize: '16px', padding: '0 4px', lineHeight: 1 }}
              title="Dodaj źródło">+</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {importSources.map(src => {
              const isEditing = editingSource === src.id;
              const fields = configFields(src.source_type);
              return (
                <div key={src.id} style={{
                  border: `1px solid ${isEditing ? COLORS.primary + '60' : COLORS.border}`,
                  borderRadius: '8px', overflow: 'hidden',
                  background: isEditing ? `${COLORS.primary}08` : COLORS.bgTertiary,
                }}>
                  <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>{src.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: '500' }}>{src.name}</div>
                      <div style={{ fontSize: '10px', color: COLORS.textMuted }}>{src.source_type}</div>
                    </div>
                    <button onClick={() => openEditor(src)} style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      fontSize: '14px', color: COLORS.textMuted, padding: '2px 4px',
                    }} title="Konfiguracja">⚙️</button>
                    <button onClick={() => handleImport(src)} disabled={importing} style={{
                      background: COLORS.primary, border: 'none', borderRadius: '6px',
                      color: '#fff', cursor: importing ? 'wait' : 'pointer',
                      padding: '6px 12px', fontSize: '11px', fontWeight: '500',
                      opacity: importing ? 0.6 : 1,
                    }}>
                      {importing ? '...' : 'Importuj'}
                    </button>
                  </div>

                  {isEditing && (
                    <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${COLORS.border}` }}>
                      <div style={{ marginTop: '12px', marginBottom: '10px' }}>
                        <label style={{ display: 'block', fontSize: '11px', color: COLORS.textMuted, marginBottom: '4px' }}>Nazwa</label>
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} style={inputStyle} />
                      </div>
                      {renderConfigFields(fields, editConfig, setEditConfig)}
                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                        <button onClick={() => handleTestConnection(src)} disabled={testing}
                          style={{
                            flex: 1, padding: '8px', fontSize: '11px', fontWeight: '500',
                            background: COLORS.bgSecondary, border: `1px solid ${COLORS.border}`,
                            borderRadius: '6px', color: COLORS.text,
                            cursor: testing ? 'wait' : 'pointer', opacity: testing ? 0.6 : 1,
                          }}>
                          {testing ? 'Testowanie...' : '🔌 Test'}
                        </button>
                        <button onClick={() => handleSaveConfig(src)} disabled={saving}
                          style={{
                            flex: 1, padding: '8px', fontSize: '11px', fontWeight: '500',
                            background: COLORS.primary, border: 'none', borderRadius: '6px',
                            color: '#fff', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1,
                          }}>
                          {saving ? '...' : '💾 Zapisz'}
                        </button>
                        <button onClick={() => { if (confirm('Usunąć to źródło?')) handleDeleteSource(src); }} disabled={saving}
                          style={{
                            padding: '8px', fontSize: '11px',
                            background: 'transparent', border: `1px solid #ef444440`,
                            borderRadius: '6px', color: '#ef4444', cursor: 'pointer',
                          }} title="Usuń źródło">🗑️</button>
                      </div>
                      {testResult && (
                        <div style={{
                          marginTop: '8px', padding: '8px 12px', borderRadius: '6px', fontSize: '11px',
                          background: testResult.ok ? `${COLORS.success}15` : '#ef444415',
                          border: `1px solid ${testResult.ok ? COLORS.success + '30' : '#ef444430'}`,
                          color: testResult.ok ? COLORS.success : '#ef4444', wordBreak: 'break-word',
                        }}>
                          {testResult.ok ? '✓' : '✗'} {testResult.message}
                        </div>
                      )}
                    </div>
                  )}

                  {src.last_run_at && !isEditing && (
                    <div style={{ padding: '0 14px 8px', fontSize: '10px', color: COLORS.textMuted }}>
                      Ostatnio: {new Date(src.last_run_at).toLocaleString('pl-PL')}
                      {src.last_run_status && <span> · {src.last_run_status === 'success' ? '✅' : '❌'} {src.last_run_count} dok.</span>}
                    </div>
                  )}
                </div>
              );
            })}

            {importSources.length === 0 && !adding && (
              <div style={{ padding: '12px', background: COLORS.bgTertiary, borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: COLORS.textMuted }}>Brak skonfigurowanych źródeł importu</div>
              </div>
            )}
          </div>
        </div>

        {/* Add new source form */}
        {adding && (
          <div style={{
            padding: '14px', background: `${COLORS.primary}08`, borderRadius: '10px',
            border: `1px solid ${COLORS.primary}40`, marginBottom: '16px',
          }}>
            <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '10px', color: COLORS.primary }}>
              Nowe źródło importu
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '12px' }}>
              {IMPORT_TYPES.map(t => (
                <button key={t.type} onClick={() => { setNewType(t); setNewName(prev => prev || t.name); setNewConfig({}); }}
                  style={{
                    padding: '6px 10px', fontSize: '11px',
                    border: `1px solid ${newType?.type === t.type ? COLORS.primary : COLORS.border}`,
                    borderRadius: '6px',
                    background: newType?.type === t.type ? `${COLORS.primary}20` : COLORS.bgTertiary,
                    color: newType?.type === t.type ? COLORS.primary : COLORS.text,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                  }}>
                  <span>{t.icon}</span> {t.name}
                </button>
              ))}
            </div>
            {newType && (
              <>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: COLORS.textMuted, marginBottom: '4px' }}>Nazwa</label>
                  <input value={newName} onChange={(e) => setNewName(e.target.value)}
                    placeholder={`np. ${newType.name}`} style={inputStyle} />
                </div>
                {renderConfigFields(configFields(newType.type), newConfig, setNewConfig)}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={handleAddSource} disabled={saving || !newName}
                    style={{
                      flex: 1, padding: '8px', fontSize: '12px', fontWeight: '500',
                      background: COLORS.primary, border: 'none', borderRadius: '6px',
                      color: '#fff', cursor: saving ? 'wait' : 'pointer',
                      opacity: (!newName || saving) ? 0.5 : 1,
                    }}>
                    {saving ? '...' : 'Dodaj źródło'}
                  </button>
                  <button onClick={() => { setAdding(false); setNewType(null); }}
                    style={{
                      padding: '8px 14px', fontSize: '12px',
                      background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
                      borderRadius: '6px', color: COLORS.textMuted, cursor: 'pointer',
                    }}>Anuluj</button>
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: '16px' }}>
          <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: '8px', textTransform: 'uppercase', fontWeight: '600' }}>
            Upload pliku
          </div>
          <input ref={fileInputRef} type="file" accept=".csv,.txt,.tsv" onChange={handleCsvUpload} style={{ display: 'none' }} />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            style={{
              width: '100%', padding: '12px 14px', fontSize: '13px', fontWeight: '500',
              border: `1px dashed ${COLORS.border}`, borderRadius: '8px',
              background: COLORS.bgTertiary, color: COLORS.text,
              cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.6 : 1,
              display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center',
            }}>
            <span>📄</span>
            <span>{uploading ? 'Importowanie...' : 'Upload CSV / plik faktur'}</span>
          </button>
          {uploadResult && (
            <div style={{
              marginTop: '8px', padding: '8px 12px', borderRadius: '6px', fontSize: '12px',
              background: uploadResult.errors?.length ? `${COLORS.warning}20` : `${COLORS.success}20`,
              color: uploadResult.errors?.length ? COLORS.warning : COLORS.success,
            }}>
              ✓ Zaimportowano {uploadResult.imported} dokumentów
              {uploadResult.errors?.length > 0 && (
                <div style={{ marginTop: '4px' }}>⚠ {uploadResult.errors.length} błędów</div>
              )}
            </div>
          )}
        </div>
      </div>
  );
}

function DescribePanel({ data, navigate }) {
  const { task, documents } = data;
  const docsNew = documents.filter(d => d.status === 'new');
  const docsDescribed = documents.filter(d => d.status === 'described' || d.status === 'approved');
  const docsExported = documents.filter(d => d.status === 'exported');
  const docsTotal = documents.length;
  const progress = docsTotal > 0 ? Math.round(((docsDescribed.length + docsExported.length) / docsTotal) * 100) : 0;

  return (
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        <div style={{ padding: '12px', background: COLORS.bgTertiary, borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Podsumowanie</div>
          <InfoRow label="Zadanie" value={`${task.icon} ${task.name}`} />
          <InfoRow label="Wszystkich" value={`${docsTotal}`} />
          <InfoRow label="Do opisu" value={`${docsNew.length}`} />
          <InfoRow label="Opisanych" value={`${docsDescribed.length}`} />
          <InfoRow label="Wyeksportowanych" value={`${docsExported.length}`} />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: '6px', textTransform: 'uppercase', fontWeight: '600' }}>
            Postęp opisu
          </div>
          <div style={{ height: '8px', background: COLORS.border, borderRadius: '4px', overflow: 'hidden', marginBottom: '4px' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: progress === 100 ? COLORS.success : COLORS.primary, transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: '11px', color: COLORS.textMuted, textAlign: 'right' }}>{progress}%</div>
        </div>

        {docsNew.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: '8px', textTransform: 'uppercase', fontWeight: '600' }}>
              Dokumenty do opisu ({docsNew.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {docsNew.slice(0, 10).map(doc => (
                <button key={doc.id} onClick={() => {
                  const m = location.pathname.match(/\/entity\/([^/]+)\/project\/([^/]+)\/task\/([^/]+)/);
                  if (m) navigate(`/entity/${m[1]}/project/${m[2]}/task/${m[3]}/document/${doc.id}`);
                }} style={{
                  padding: '8px 12px', fontSize: '12px',
                  border: `1px solid ${COLORS.border}`, borderRadius: '6px',
                  background: COLORS.bgTertiary, color: COLORS.text,
                  cursor: 'pointer', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                  <span style={{ color: COLORS.warning }}>○</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.metadata?.vendor_name || doc.metadata?.number || doc.original_filename || doc.id.slice(0, 8)}
                  </span>
                </button>
              ))}
              {docsNew.length > 10 && (
                <div style={{ fontSize: '11px', color: COLORS.textMuted, textAlign: 'center', padding: '4px' }}>
                  ...i {docsNew.length - 10} więcej
                </div>
              )}
            </div>
          </div>
        )}

        {docsNew.length === 0 && docsTotal > 0 && (
          <div style={{
            padding: '16px', background: `${COLORS.success}10`, border: `1px solid ${COLORS.success}30`,
            borderRadius: '8px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '20px', marginBottom: '4px' }}>✓</div>
            <div style={{ fontSize: '13px', color: COLORS.success, fontWeight: '500' }}>Wszystkie dokumenty opisane</div>
          </div>
        )}

        {docsTotal === 0 && (
          <div style={{
            padding: '16px', background: COLORS.bgTertiary,
            borderRadius: '8px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '12px', color: COLORS.textMuted }}>Brak dokumentów — najpierw zaimportuj</div>
          </div>
        )}
      </div>
  );
}

function BulkEditPanel({ data, api, setDocuments, setError, selectedDocs, setSelectedDocs, navigate, activeProject }) {
  const { task, documents } = data;
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selected = documents.filter(d => selectedDocs?.includes(d.id));
  const projectTags = [...new Set([...(activeProject?.categories || []), ...(activeProject?.tags || [])])];

  const handleBulkDelete = async () => {
    if (!selectedDocs?.length) return;
    setDeleting(true);
    setResult(null);
    try {
      const res = await api('/documents/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ document_ids: selectedDocs }),
      });
      setResult({ ok: true, text: `Usunięto ${res.count} dokumentów` });
      const updated = await api(`/tasks/${task.id}/documents`);
      setDocuments(updated);
      setSelectedDocs([]);
      setConfirmBulkDelete(false);
      setTimeout(() => setResult(null), 4000);
    } catch (e) {
      if (!e.sessionExpired) setResult({ ok: false, text: e.message });
    }
    finally { setDeleting(false); }
  };

  const addTag = () => {
    const t = newTag.trim();
    if (t && !tags.includes(t)) { setTags(prev => [...prev, t]); setNewTag(''); }
  };

  const handleBulkSave = async () => {
    if (!selectedDocs?.length) return;
    setSaving(true);
    setResult(null);
    const body = { document_ids: selectedDocs };
    if (category.trim()) body.category = category.trim();
    if (tags.length > 0) body.tags = tags;
    if (description.trim()) body.description = description.trim();

    if (!body.category && !body.tags && !body.description) {
      setResult({ ok: false, text: 'Wypełnij przynajmniej jedno pole' });
      setSaving(false);
      return;
    }

    try {
      const res = await api('/documents/bulk-metadata', {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setResult({ ok: true, text: `Zaktualizowano ${res.updated} z ${res.total} dokumentów` });
      // Refresh documents
      const updated = await api(`/tasks/${task.id}/documents`);
      setDocuments(updated);
      setTimeout(() => setResult(null), 4000);
    } catch (e) {
      if (!e.sessionExpired) setResult({ ok: false, text: e.message });
    }
    finally { setSaving(false); }
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
      {/* Selection summary */}
      <div style={{ padding: '12px', background: COLORS.bgTertiary, borderRadius: '8px', marginBottom: '16px' }}>
        <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>
          Zaznaczone dokumenty
        </div>
        {selected.length > 0 ? (
          <>
            <div style={{ fontSize: '14px', fontWeight: '600', color: COLORS.primary, marginBottom: '6px' }}>
              {selected.length} {selected.length === 1 ? 'dokument' : selected.length < 5 ? 'dokumenty' : 'dokumentów'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '120px', overflow: 'auto' }}>
              {selected.map(doc => (
                <div key={doc.id} style={{ fontSize: '11px', color: COLORS.text, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: COLORS.primary }}>•</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.number || doc.contractor_name || doc.id.slice(0, 8)}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setSelectedDocs([])}
              style={{
                marginTop: '8px', padding: '4px 10px', fontSize: '10px',
                background: 'transparent', border: `1px solid ${COLORS.border}`,
                borderRadius: '6px', color: COLORS.textMuted, cursor: 'pointer',
              }}
            >
              Odznacz wszystkie
            </button>
          </>
        ) : (
          <div style={{ fontSize: '12px', color: COLORS.textMuted }}>
            Zaznacz dokumenty w tabeli (checkbox po lewej), aby edytować je zbiorczo.
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <>
          {/* Category */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: COLORS.textMuted, marginBottom: '4px', textTransform: 'uppercase' }}>
              Kategoria (nadpisz)
            </label>
            <input
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="np. IT, Biuro, Transport..."
              style={{
                width: '100%', padding: '10px 12px', fontSize: '13px',
                background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
                borderRadius: '8px', color: COLORS.text, boxSizing: 'border-box',
              }}
            />
            {projectTags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                {projectTags.map(t => (
                  <button key={t} type="button" onClick={() => setCategory(t)} style={{
                    padding: '3px 8px', fontSize: '10px', fontWeight: '500',
                    background: COLORS.bgTertiary, color: COLORS.textMuted,
                    border: `1px solid ${COLORS.border}`, borderRadius: '10px', cursor: 'pointer',
                  }}>{t}</button>
                ))}
              </div>
            )}
          </div>

          {/* Tags */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: COLORS.textMuted, marginBottom: '4px', textTransform: 'uppercase' }}>
              Tagi (dodaj do istniejących)
            </label>
            {tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                {tags.map(t => (
                  <span key={t} style={{
                    fontSize: '11px', padding: '3px 8px', borderRadius: '10px',
                    background: `${COLORS.primary}20`, color: COLORS.primary,
                    display: 'flex', alignItems: 'center', gap: '4px',
                  }}>
                    {t}
                    <span onClick={() => setTags(prev => prev.filter(x => x !== t))}
                      style={{ cursor: 'pointer', fontSize: '10px', opacity: 0.6 }}>×</span>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Dodaj tag..."
                style={{
                  flex: 1, padding: '8px 10px', fontSize: '12px',
                  background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
                  borderRadius: '8px', color: COLORS.text, boxSizing: 'border-box',
                }}
              />
              <button onClick={addTag} disabled={!newTag.trim()} style={{
                padding: '8px 12px', fontSize: '12px', fontWeight: '500',
                background: newTag.trim() ? COLORS.primary : COLORS.bgTertiary,
                color: newTag.trim() ? '#fff' : COLORS.textMuted,
                border: 'none', borderRadius: '8px', cursor: newTag.trim() ? 'pointer' : 'default',
              }}>+</button>
            </div>
          </div>

          {/* Description */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '11px', color: COLORS.textMuted, marginBottom: '4px', textTransform: 'uppercase' }}>
              Opis (nadpisz)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Wspólny opis dla zaznaczonych..."
              style={{
                width: '100%', padding: '10px 12px', fontSize: '13px',
                background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
                borderRadius: '8px', color: COLORS.text,
                minHeight: '80px', resize: 'vertical',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Save button */}
          <button
            onClick={handleBulkSave}
            disabled={saving}
            style={{
              width: '100%', padding: '12px', fontSize: '14px', fontWeight: '500',
              background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.secondary})`,
              border: 'none', borderRadius: '8px', color: '#fff',
              cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? '...' : `Zapisz dla ${selected.length} dokumentów`}
          </button>

          {/* Bulk delete */}
          <div style={{ marginTop: '12px', borderTop: `1px solid ${COLORS.border}`, paddingTop: '12px' }}>
            {!confirmBulkDelete ? (
              <button
                onClick={() => setConfirmBulkDelete(true)}
                style={{
                  width: '100%', padding: '10px', fontSize: '12px', fontWeight: '500',
                  background: 'transparent', border: `1px solid #ef444440`,
                  borderRadius: '8px', color: '#ef4444', cursor: 'pointer',
                }}
              >
                🗑️ Usuń {selected.length} {selected.length === 1 ? 'dokument' : selected.length < 5 ? 'dokumenty' : 'dokumentów'}
              </button>
            ) : (
              <div style={{ padding: '10px', background: '#ef444415', borderRadius: '8px', border: '1px solid #ef444440' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#ef4444', marginBottom: '8px' }}>
                  Na pewno usunąć {selected.length} {selected.length === 1 ? 'dokument' : selected.length < 5 ? 'dokumenty' : 'dokumentów'}?
                </div>
                <div style={{ fontSize: '11px', color: COLORS.textMuted, marginBottom: '10px' }}>
                  Tej operacji nie można cofnąć.
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleBulkDelete}
                    disabled={deleting}
                    style={{
                      flex: 1, padding: '8px', fontSize: '12px', fontWeight: '600',
                      background: '#ef4444', color: '#fff', border: 'none',
                      borderRadius: '6px', cursor: deleting ? 'wait' : 'pointer',
                      opacity: deleting ? 0.7 : 1,
                    }}
                  >{deleting ? 'Usuwanie...' : 'Tak, usuń'}</button>
                  <button
                    onClick={() => setConfirmBulkDelete(false)}
                    disabled={deleting}
                    style={{
                      flex: 1, padding: '8px', fontSize: '12px', fontWeight: '500',
                      background: COLORS.bgTertiary, color: COLORS.textMuted,
                      border: `1px solid ${COLORS.border}`, borderRadius: '6px', cursor: 'pointer',
                    }}
                  >Anuluj</button>
                </div>
              </div>
            )}
          </div>

          {result && (
            <div style={{
              marginTop: '8px', padding: '8px 12px', fontSize: '12px', borderRadius: '8px',
              background: result.ok ? `${COLORS.success}15` : '#ef444415',
              color: result.ok ? COLORS.success : '#ef4444',
              border: `1px solid ${result.ok ? COLORS.success + '40' : '#ef444440'}`,
            }}>
              {result.text}
            </div>
          )}
        </>
      )}
    </div>
  );
}


function ExportPanel({ data, api, setDocuments, setSources, setError, navigate }) {
  const { task, sources, documents, projectId } = data;
  const [exporting, setExporting] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [editingSource, setEditingSource] = useState(null);
  const [editConfig, setEditConfig] = useState({});
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState(null);
  const [newName, setNewName] = useState('');
  const [newConfig, setNewConfig] = useState({});

  const exportSources = sources.filter(s => s.direction === 'export');
  const docsDescribed = documents.filter(d => d.status === 'described' || d.status === 'approved');
  const docsExported = documents.filter(d => d.status === 'exported');

  const refreshSources = async () => {
    if (!projectId || !setSources) return;
    try {
      const updated = await api(`/projects/${projectId}/sources`);
      setSources(updated);
    } catch (e) {}
  };

  const handleExport = async (source) => {
    setExporting(true);
    setLastResult(null);
    try {
      const result = await api('/flow/export', {
        method: 'POST',
        body: JSON.stringify({ source_id: source.id, task_id: task.id }),
      });
      if (result.ok === false) {
        setLastResult({ error: result.message || 'Brak dokumentów do eksportu.' });
      } else {
        setLastResult({ success: true, docs: result.docs_exported || 0 });
      }
      const docs = await api(`/tasks/${task.id}/documents`);
      setDocuments(docs);
    } catch (e) {
      if (!e.sessionExpired) {
        setLastResult({ error: e.message });
        setError(e.message);
      }
    }
    finally { setExporting(false); }
  };

  const openEditor = (src) => {
    setAdding(false);
    setEditingSource(src.id === editingSource ? null : src.id);
    setEditConfig({ ...(src.config || {}) });
    setEditName(src.name);
    setTestResult(null);
  };

  const handleSaveConfig = async (src) => {
    setSaving(true);
    try {
      await api(`/sources/${src.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editName, config: editConfig }),
      });
      setEditingSource(null);
      await refreshSources();
    } catch (e) { if (!e.sessionExpired) setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDeleteSource = async (src) => {
    setSaving(true);
    try {
      await api(`/sources/${src.id}`, { method: 'DELETE' });
      setEditingSource(null);
      await refreshSources();
    } catch (e) { if (!e.sessionExpired) setError(e.message); }
    finally { setSaving(false); }
  };

  const handleTestConnection = async (src) => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api(`/sources/${src.id}/test-connection`, { method: 'POST' });
      setTestResult(result);
    } catch (e) {
      setTestResult({ ok: false, message: e.message });
    }
    finally { setTesting(false); }
  };

  const handleAddSource = async () => {
    if (!newType || !newName || !projectId) return;
    setSaving(true);
    try {
      await api(`/projects/${projectId}/sources`, {
        method: 'POST',
        body: JSON.stringify({
          project_id: projectId,
          direction: 'export',
          source_type: newType.type,
          name: newName,
          config: newConfig,
        }),
      });
      setAdding(false);
      setNewType(null);
      setNewName('');
      setNewConfig({});
      await refreshSources();
    } catch (e) { if (!e.sessionExpired) setError(e.message); }
    finally { setSaving(false); }
  };

  const EXPORT_TYPES = [
    { type: 'wfirma', name: 'wFirma (CSV)', icon: '📊' },
    { type: 'jpk_pkpir', name: 'JPK_PKPIR (XML)', icon: '📋' },
    { type: 'comarch', name: 'Comarch Optima (XML)', icon: '🔷' },
    { type: 'symfonia', name: 'Symfonia (CSV)', icon: '🎵' },
    { type: 'enova', name: 'enova365 (XML)', icon: '🟢' },
    { type: 'csv', name: 'CSV ogólny', icon: '📄' },
  ];

  const WFIRMA_FIELDS = [
    { key: 'encoding', label: 'Kodowanie', placeholder: 'utf-8-sig', options: ['utf-8', 'utf-8-sig', 'cp1250', 'iso-8859-2'] },
    { key: 'date_format', label: 'Format daty', placeholder: '%Y-%m-%d', options: ['%Y-%m-%d', '%d-%m-%Y', '%d.%m.%Y'] },
  ];
  const JPK_FIELDS = [
    { key: 'nip', label: 'NIP firmy', placeholder: '1234567890' },
    { key: 'company_name', label: 'Nazwa firmy', placeholder: 'Firma Sp. z o.o.' },
  ];
  const CSV_FIELDS = [
    { key: 'delimiter', label: 'Separator', placeholder: ';', options: [';', ',', '\t'] },
    { key: 'encoding', label: 'Kodowanie', placeholder: 'utf-8-sig', options: ['utf-8', 'utf-8-sig', 'cp1250', 'iso-8859-2'] },
  ];

  const configFields = (srcType) => {
    if (srcType === 'wfirma') return WFIRMA_FIELDS;
    if (srcType === 'jpk_pkpir') return JPK_FIELDS;
    if (srcType === 'csv') return CSV_FIELDS;
    return [];
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', background: COLORS.bgSecondary,
    border: `1px solid ${COLORS.border}`, borderRadius: '6px',
    color: COLORS.text, fontSize: '12px', boxSizing: 'border-box',
  };

  const renderConfigFields = (fields, config, setConfig) => fields.map(f => (
    <div key={f.key} style={{ marginBottom: '10px' }}>
      <label style={{ display: 'block', fontSize: '11px', color: COLORS.textMuted, marginBottom: '4px' }}>{f.label}</label>
      {f.options ? (
        <select value={config[f.key] || ''} onChange={(e) => setConfig(prev => ({ ...prev, [f.key]: e.target.value }))}
          style={inputStyle}>
          <option value="">—</option>
          {f.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input type={f.type || 'text'} value={config[f.key] || ''}
          onChange={(e) => setConfig(prev => ({ ...prev, [f.key]: e.target.value }))}
          placeholder={f.placeholder} style={inputStyle} />
      )}
    </div>
  ));

  const noDocsReady = docsDescribed.length === 0;

  return (
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        <div style={{ padding: '12px', background: COLORS.bgTertiary, borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Podsumowanie</div>
          <InfoRow label="Zadanie" value={`${task.icon} ${task.name}`} />
          <InfoRow label="Gotowe do eksportu" value={`${docsDescribed.length}`} />
          <InfoRow label="Wyeksportowane" value={`${docsExported.length}`} />
          <InfoRow label="Cele eksportu" value={`${exportSources.length}`} />
        </div>

        {/* Source list */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{
            fontSize: '10px', color: COLORS.textMuted, marginBottom: '8px', textTransform: 'uppercase', fontWeight: '600',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>Cele eksportu</span>
            <button onClick={() => { setAdding(!adding); setEditingSource(null); setNewType(null); setNewName(''); setNewConfig({}); }}
              style={{ background: 'transparent', border: 'none', color: COLORS.primary, cursor: 'pointer', fontSize: '16px', padding: '0 4px', lineHeight: 1 }}
              title="Dodaj cel eksportu">+</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {exportSources.map(src => {
              const isEditing = editingSource === src.id;
              const fields = configFields(src.source_type);
              const isDisabled = exporting || noDocsReady;
              return (
                <div key={src.id} style={{
                  border: `1px solid ${isEditing ? COLORS.primary + '60' : COLORS.border}`,
                  borderRadius: '8px', overflow: 'hidden',
                  background: isEditing ? `${COLORS.primary}08` : COLORS.bgTertiary,
                }}>
                  <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>{src.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: '500' }}>{src.name}</div>
                      <div style={{ fontSize: '10px', color: COLORS.textMuted }}>{src.source_type}</div>
                    </div>
                    <button onClick={() => openEditor(src)} style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      fontSize: '14px', color: COLORS.textMuted, padding: '2px 4px',
                    }} title="Konfiguracja">⚙️</button>
                    <button onClick={() => handleExport(src)} disabled={isDisabled}
                      title={noDocsReady ? 'Brak opisanych dokumentów' : `Eksportuj do ${src.name}`}
                      style={{
                        background: isDisabled ? COLORS.bgSecondary : COLORS.primary,
                        border: 'none', borderRadius: '6px',
                        color: isDisabled ? COLORS.textMuted : '#fff',
                        cursor: isDisabled ? 'not-allowed' : 'pointer',
                        padding: '6px 12px', fontSize: '11px', fontWeight: '500',
                        opacity: isDisabled ? 0.5 : 1,
                      }}>
                      {exporting ? '...' : 'Eksportuj'}
                    </button>
                  </div>

                  {isEditing && (
                    <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${COLORS.border}` }}>
                      <div style={{ marginTop: '12px', marginBottom: '10px' }}>
                        <label style={{ display: 'block', fontSize: '11px', color: COLORS.textMuted, marginBottom: '4px' }}>Nazwa</label>
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} style={inputStyle} />
                      </div>
                      {renderConfigFields(fields, editConfig, setEditConfig)}
                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                        <button onClick={() => handleTestConnection(src)} disabled={testing}
                          style={{
                            flex: 1, padding: '8px', fontSize: '11px', fontWeight: '500',
                            background: COLORS.bgSecondary, border: `1px solid ${COLORS.border}`,
                            borderRadius: '6px', color: COLORS.text,
                            cursor: testing ? 'wait' : 'pointer', opacity: testing ? 0.6 : 1,
                          }}>
                          {testing ? 'Testowanie...' : '🔌 Test'}
                        </button>
                        <button onClick={() => handleSaveConfig(src)} disabled={saving}
                          style={{
                            flex: 1, padding: '8px', fontSize: '11px', fontWeight: '500',
                            background: COLORS.primary, border: 'none', borderRadius: '6px',
                            color: '#fff', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1,
                          }}>
                          {saving ? '...' : '💾 Zapisz'}
                        </button>
                        <button onClick={() => { if (confirm('Usunąć ten cel eksportu?')) handleDeleteSource(src); }} disabled={saving}
                          style={{
                            padding: '8px', fontSize: '11px',
                            background: 'transparent', border: `1px solid #ef444440`,
                            borderRadius: '6px', color: '#ef4444', cursor: 'pointer',
                          }} title="Usuń">🗑️</button>
                      </div>
                      {testResult && (
                        <div style={{
                          marginTop: '8px', padding: '8px 12px', borderRadius: '6px', fontSize: '11px',
                          background: testResult.ok ? `${COLORS.success}15` : '#ef444415',
                          border: `1px solid ${testResult.ok ? COLORS.success + '30' : '#ef444430'}`,
                          color: testResult.ok ? COLORS.success : '#ef4444', wordBreak: 'break-word',
                        }}>
                          {testResult.ok ? '✓' : '✗'} {testResult.message}
                        </div>
                      )}
                    </div>
                  )}

                  {src.last_run_at && !isEditing && (
                    <div style={{ padding: '0 14px 8px', fontSize: '10px', color: COLORS.textMuted }}>
                      Ostatnio: {new Date(src.last_run_at).toLocaleString('pl-PL')}
                      {src.last_run_status && <span> · {src.last_run_status === 'success' ? '✅' : '❌'} {src.last_run_count} dok.</span>}
                    </div>
                  )}
                </div>
              );
            })}

            {exportSources.length === 0 && !adding && (
              <div style={{ padding: '12px', background: COLORS.bgTertiary, borderRadius: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '12px', color: COLORS.textMuted }}>Brak skonfigurowanych celów eksportu</div>
              </div>
            )}
          </div>
        </div>

        {/* Add new export source form */}
        {adding && (
          <div style={{
            padding: '14px', background: `${COLORS.primary}08`, borderRadius: '10px',
            border: `1px solid ${COLORS.primary}40`, marginBottom: '16px',
          }}>
            <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '10px', color: COLORS.primary }}>
              Nowy cel eksportu
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '12px' }}>
              {EXPORT_TYPES.map(t => (
                <button key={t.type} onClick={() => { setNewType(t); setNewName(prev => prev || t.name); setNewConfig({}); }}
                  style={{
                    padding: '6px 10px', fontSize: '11px',
                    border: `1px solid ${newType?.type === t.type ? COLORS.primary : COLORS.border}`,
                    borderRadius: '6px',
                    background: newType?.type === t.type ? `${COLORS.primary}20` : COLORS.bgTertiary,
                    color: newType?.type === t.type ? COLORS.primary : COLORS.text,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                  }}>
                  <span>{t.icon}</span> {t.name}
                </button>
              ))}
            </div>
            {newType && (
              <>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '11px', color: COLORS.textMuted, marginBottom: '4px' }}>Nazwa</label>
                  <input value={newName} onChange={(e) => setNewName(e.target.value)}
                    placeholder={`np. ${newType.name}`} style={inputStyle} />
                </div>
                {renderConfigFields(configFields(newType.type), newConfig, setNewConfig)}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={handleAddSource} disabled={saving || !newName}
                    style={{
                      flex: 1, padding: '8px', fontSize: '12px', fontWeight: '500',
                      background: COLORS.primary, border: 'none', borderRadius: '6px',
                      color: '#fff', cursor: saving ? 'wait' : 'pointer',
                      opacity: (!newName || saving) ? 0.5 : 1,
                    }}>
                    {saving ? '...' : 'Dodaj cel'}
                  </button>
                  <button onClick={() => { setAdding(false); setNewType(null); }}
                    style={{
                      padding: '8px 14px', fontSize: '12px',
                      background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
                      borderRadius: '6px', color: COLORS.textMuted, cursor: 'pointer',
                    }}>Anuluj</button>
                </div>
              </>
            )}
          </div>
        )}

        {lastResult && (
          <div style={{
            padding: '10px 12px', borderRadius: '8px', fontSize: '12px', marginBottom: '16px',
            background: lastResult.error ? '#ef444415' : `${COLORS.success}15`,
            border: `1px solid ${lastResult.error ? '#ef444430' : COLORS.success + '30'}`,
            color: lastResult.error ? '#ef4444' : COLORS.success,
          }}>
            {lastResult.error
              ? `⚠ ${lastResult.error}`
              : `✓ Wyeksportowano ${lastResult.docs} dokumentów`}
          </div>
        )}

        {docsDescribed.length > 0 && (
          <div style={{ padding: '8px 12px', background: `${COLORS.primary}10`, borderRadius: '8px', fontSize: '12px', color: COLORS.primary }}>
            {docsDescribed.length} dokumentów gotowych do eksportu
          </div>
        )}
        {docsExported.length > 0 && (
          <div style={{ marginTop: '8px', padding: '8px 12px', background: `${COLORS.success}10`, borderRadius: '8px', fontSize: '12px', color: COLORS.success }}>
            ✓ {docsExported.length} już wyeksportowanych
          </div>
        )}
      </div>
  );
}
