import React from 'react';
import { COLORS, STATUS_CONFIG } from '../constants.js';

export default function TaskContentArea({ activeTask, documents, setDocuments, sources, selectedDocument, taskPath, navigate, api, setError, loading, setLoading }) {
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
