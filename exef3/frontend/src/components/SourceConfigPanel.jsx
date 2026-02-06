import React, { useState, useEffect } from 'react';
import { COLORS } from '../constants.js';

export default function SourceConfigPanel({ data, onClose, api, setSources, setError }) {
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
    } catch (e) { if (!e.sessionExpired) setError(e.message); }
    finally { setBusy(false); }
  };

  const handleDelete = async (sourceId) => {
    setBusy(true);
    try {
      await api(`/sources/${sourceId}`, { method: 'DELETE' });
      const updated = await api(`/projects/${projectId}/sources`);
      setSources(updated);
    } catch (e) { if (!e.sessionExpired) setError(e.message); }
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
    } catch (e) { if (!e.sessionExpired) setError(e.message); }
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
