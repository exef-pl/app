import React from 'react';
import { COLORS } from '../constants.js';

export default function ActivitiesSidebar({ activeTask, documents, sources, taskPath, navigate, activePanel }) {
  const importSources = sources.filter(s => s.direction === 'import');
  const exportSources = sources.filter(s => s.direction === 'export');

  const docsNew = documents.filter(d => d.status === 'new');
  const docsDescribed = documents.filter(d => d.status === 'described' || d.status === 'approved');
  const docsTotal = documents.length;

  const phaseColor = (s) => {
    if (s === 'completed') return COLORS.success;
    if (s === 'in_progress') return COLORS.warning;
    return COLORS.textMuted;
  };

  const ActivityRow = ({ icon, label, detail, color, status, onClick, isActive }) => (
    <div onClick={onClick} style={{
      padding: '8px 10px', borderRadius: '8px',
      background: isActive ? COLORS.bgTertiary : 'transparent',
      border: isActive ? `1px solid ${COLORS.border}` : '1px solid transparent',
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
    </div>
  );

  const impStatus = activeTask.import_status || 'not_started';
  const descStatus = activeTask.describe_status || 'not_started';
  const expStatus = activeTask.export_status || 'not_started';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <ActivityRow icon="➕" label="Dodaj" detail="Nowy dokument"
        color={COLORS.primary} status={null}
        onClick={() => taskPath && navigate(`${taskPath}/document/new`)}
      />
      <ActivityRow icon="📥" label="Import"
        detail={`${importSources.length} źródeł · ${docsTotal} dok.`}
        color={phaseColor(impStatus)} status={impStatus}
        onClick={() => taskPath && navigate(`${taskPath}/import`)}
        isActive={activePanel === 'activity-import'}
      />
      <ActivityRow icon="✏️" label="Opis"
        detail={`${docsNew.length} do opisu · ${docsDescribed.length} opisanych`}
        color={phaseColor(descStatus)} status={descStatus}
        onClick={() => taskPath && navigate(`${taskPath}/describe`)}
        isActive={activePanel === 'activity-describe'}
      />
      <ActivityRow icon="📤" label="Eksport"
        detail={`${exportSources.length} celów · ${docsDescribed.length} gotowych`}
        color={phaseColor(expStatus)} status={expStatus}
        onClick={() => taskPath && navigate(`${taskPath}/export`)}
        isActive={activePanel === 'activity-export'}
      />
    </div>
  );
}
