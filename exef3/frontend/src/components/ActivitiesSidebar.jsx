import React, { useState } from 'react';
import { COLORS } from '../constants.js';

export default function ActivitiesSidebar({ activeTask, documents, setDocuments, sources, taskPath, navigate, api, setError, onSourceSelect }) {
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
    } catch (e) { if (!e.sessionExpired) setError(e.message); }
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
    } catch (e) { if (!e.sessionExpired) setError(e.message); }
    finally { setExporting(false); }
  };

  const phaseColor = (s) => {
    if (s === 'completed') return COLORS.success;
    if (s === 'in_progress') return COLORS.warning;
    return COLORS.textMuted;
  };

  const toggle = (key) => setExpanded(expanded === key ? null : key);

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
                <div key={src.id} style={{ display: 'flex', gap: '3px' }}>
                  <button onClick={(e) => { e.stopPropagation(); handleImport(src); }} disabled={importing}
                    style={{
                      flex: 1, padding: '5px 8px', fontSize: '10px',
                      border: `1px solid ${COLORS.border}`, borderRadius: '6px',
                      background: COLORS.bgSecondary, color: COLORS.text,
                      cursor: importing ? 'wait' : 'pointer', opacity: importing ? 0.6 : 1,
                      display: 'flex', alignItems: 'center', gap: '5px', textAlign: 'left',
                    }}>
                    <span>{src.icon}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{src.name}</span>
                  </button>
                  {onSourceSelect && (
                    <button onClick={(e) => { e.stopPropagation(); onSourceSelect(src); }}
                      style={{
                        padding: '5px 6px', fontSize: '10px',
                        border: `1px solid ${COLORS.border}`, borderRadius: '6px',
                        background: COLORS.bgSecondary, color: COLORS.textMuted,
                        cursor: 'pointer',
                      }}
                      title="Konfiguracja"
                    >⚙️</button>
                  )}
                </div>
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
          <div style={{ fontSize: '10px', color: COLORS.warning, padding: '4px 0' }}>
            ⚠ {docsNew.length} do opisu
          </div>
        )}
        {docsDescribed.length > 0 && (
          <div style={{ fontSize: '10px', color: COLORS.success, padding: '2px 0' }}>
            ✓ {docsDescribed.length} opisanych
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
          <div>
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
        {exportSources.length === 0 && (
          <div style={{ fontSize: '10px', color: COLORS.textMuted, textAlign: 'center', padding: '4px 0' }}>Brak skonfigurowanych celów</div>
        )}
        {docsDescribed.length > 0 && (
          <div style={{ fontSize: '10px', color: COLORS.primary, padding: '4px 0' }}>
            {docsDescribed.length} gotowych do eksportu
          </div>
        )}
        {docsExported.length > 0 && (
          <div style={{ fontSize: '10px', color: COLORS.success, padding: '2px 0' }}>
            ✓ {docsExported.length} wyeksportowanych
          </div>
        )}
      </ActivityRow>
    </div>
  );
}
