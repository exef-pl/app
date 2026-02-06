import React, { useState, useEffect } from 'react';
import { COLORS, API_URL, ENTITY_TYPES, PROJECT_TYPES } from '../constants.js';
import { InputField, InfoRow } from './ui.jsx';
import SourceConfigPanel from './SourceConfigPanel.jsx';

export default function RightPanel({ 
  type, data, onClose, navigate,
  onCreateEntity, onCreateProject, onCreateTask, onCreateDocument, onUpdateDocumentMetadata,
  loading, activeEntity, activeProject, activeTask,
  projectId, setTasks, setDocuments,
  api, setSources, setError,
  setProjects, entityId,
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
    return <DocumentViewPanel doc={data} onClose={onClose} api={api} setDocuments={setDocuments} setError={setError} projectTags={[...new Set([...(activeProject?.categories || []), ...(activeProject?.tags || [])])]} />;
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
  const projType = PROJECT_TYPES[data.type] || { icon: '📁', label: data.type };
  const isArchived = data.is_archived;

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

function DocumentViewPanel({ doc, onClose, api, setDocuments, setError, projectTags = [] }) {
  const meta = doc.metadata || {};
  const [description, setDescription] = useState(meta.description || '');
  const [category, setCategory] = useState(meta.category || '');
  const [tags, setTags] = useState(meta.tags || []);
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [duplicates, setDuplicates] = useState([]);

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
    new: { bg: '#3b82f620', color: '#3b82f6', label: 'Nowy' },
    described: { bg: '#f59e0b20', color: '#f59e0b', label: 'Opisany' },
    approved: { bg: '#10b98120', color: '#10b981', label: 'Zatwierdzony' },
    exported: { bg: '#8b5cf620', color: '#8b5cf6', label: 'Wyeksportowany' },
  };
  const st = statusColors[doc.status] || statusColors.new;

  return (
    <>
      <div style={{
        padding: '16px', borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600' }}>📄 {doc.number || 'Dokument'}</h3>
        <button onClick={onClose} style={{
          background: COLORS.bgTertiary, border: 'none', borderRadius: '6px',
          color: COLORS.textMuted, cursor: 'pointer', width: '28px', height: '28px', fontSize: '14px',
        }}>×</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {/* Document info (read-only) */}
        <div style={{ padding: '12px', background: COLORS.bgTertiary, borderRadius: '8px', marginBottom: '16px' }}>
          <div style={{ fontSize: '10px', color: COLORS.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Dane dokumentu</div>
          <InfoRow label="Numer" value={doc.number || '—'} />
          <InfoRow label="Kontrahent" value={doc.contractor_name || '—'} />
          <InfoRow label="NIP" value={doc.contractor_nip || '—'} />
          <InfoRow label="Kwota brutto" value={doc.amount_gross ? `${doc.amount_gross.toLocaleString('pl-PL')} ${doc.currency || 'PLN'}` : '—'} />
          <InfoRow label="Data" value={doc.document_date || '—'} />
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
              <div key={d.id} style={{
                fontSize: '11px', color: COLORS.textMuted, padding: '3px 0',
                display: 'flex', justifyContent: 'space-between',
              }}>
                <span>{d.number || '—'} • {d.contractor_name || '—'}</span>
                <span style={{ fontSize: '10px', opacity: 0.7 }}>{d.source || '—'}</span>
              </div>
            ))}
          </div>
        )}

        {/* Category */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '11px', color: COLORS.textMuted, marginBottom: '4px', textTransform: 'uppercase' }}>Kategoria</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="np. IT - Hosting, Biuro, Marketing..."
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
          <label style={{ display: 'block', fontSize: '11px', color: COLORS.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Tagi</label>
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
          <label style={{ display: 'block', fontSize: '11px', color: COLORS.textMuted, marginBottom: '4px', textTransform: 'uppercase' }}>Opis</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Dodaj opis dokumentu..."
            style={{
              width: '100%', padding: '10px 12px', fontSize: '13px',
              background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
              borderRadius: '8px', color: COLORS.text,
              minHeight: '100px', resize: 'vertical',
              fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Save button */}
      <div style={{ padding: '16px', borderTop: `1px solid ${COLORS.border}` }}>
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
      </div>
    </>
  );
}
