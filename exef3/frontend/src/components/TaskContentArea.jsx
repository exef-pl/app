import React, { useState, useMemo } from 'react';
import { COLORS, STATUS_CONFIG } from '../constants.js';

const COL_WIDTHS = ['4%', '17%', '21%', '14%', '14%', '18%', '12%'];
const CV_COL_WIDTHS = ['4%', '22%', '18%', '22%', '12%', '12%', '10%'];

const COLUMNS = [
  { key: 'number', label: 'Numer', align: 'left' },
  { key: 'contractor', label: 'Kontrahent', align: 'left' },
  { key: 'amount', label: 'Kwota', align: 'right' },
  { key: 'category', label: 'Kategoria', align: 'left' },
  { key: 'status', label: 'Status', align: 'center' },
  { key: 'source', label: 'Źródło', align: 'center' },
];

const CV_COLUMNS = [
  { key: 'contractor', label: 'Kandydat', align: 'left' },
  { key: 'category', label: 'Stanowisko', align: 'left' },
  { key: 'tags', label: 'Umiejętności', align: 'left' },
  { key: 'date', label: 'Data', align: 'center' },
  { key: 'status', label: 'Status', align: 'center' },
  { key: 'source', label: 'Źródło', align: 'center' },
];

const selectStyle = {
  padding: '5px 8px', fontSize: '11px', borderRadius: '6px',
  border: `1px solid ${COLORS.border}`, background: COLORS.bgTertiary,
  color: COLORS.text, outline: 'none', minWidth: 0,
};

export default function TaskContentArea({ activeTask, activeProject, documents, setDocuments, sources, selectedDocument, selectedDocs, setSelectedDocs, taskPath, navigate, api, setError, loading, setLoading }) {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState('asc');

  const docs = documents || [];

  const filtered = useMemo(() => {
    let result = docs;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(d =>
        (d.number || '').toLowerCase().includes(q) ||
        (d.contractor_name || '').toLowerCase().includes(q) ||
        (d.contractor_nip || '').includes(q) ||
        (d.metadata?.category || '').toLowerCase().includes(q)
      );
    }
    if (filterStatus) result = result.filter(d => d.status === filterStatus);
    if (filterSource) result = result.filter(d => d.source === filterSource);
    return result;
  }, [docs, search, filterStatus, filterSource]);

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    const arr = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      let va, vb;
      switch (sortCol) {
        case 'number': va = a.number || ''; vb = b.number || ''; break;
        case 'contractor': va = a.contractor_name || ''; vb = b.contractor_name || ''; break;
        case 'amount': va = a.amount_gross ?? 0; vb = b.amount_gross ?? 0; return (va - vb) * dir;
        case 'category': va = a.metadata?.category || ''; vb = b.metadata?.category || ''; break;
        case 'status': va = a.status || ''; vb = b.status || ''; break;
        case 'source': va = a.source || ''; vb = b.source || ''; break;
        default: return 0;
      }
      return va.localeCompare(vb, 'pl') * dir;
    });
    return arr;
  }, [filtered, sortCol, sortDir]);

  if (!activeTask) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: COLORS.textMuted }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
        <div style={{ fontSize: '14px' }}>Wybierz zadanie z listy</div>
      </div>
    );
  }

  const docsNew = docs.filter(d => d.status === 'new').length;
  const docsDescribed = docs.filter(d => d.status === 'described' || d.status === 'approved').length;
  const docsExported = docs.filter(d => d.status === 'exported').length;
  const docsTotal = docs.length;
  const notExported = docs.filter(d => d.status !== 'exported').length;

  const uniqueSources = [...new Set(docs.map(d => d.source).filter(Boolean))];
  const isCV = activeProject?.type === 'rekrutacja';
  const columns = isCV ? CV_COLUMNS : COLUMNS;
  const colWidths = isCV ? CV_COL_WIDTHS : COL_WIDTHS;

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const sortIndicator = (col) => {
    if (sortCol !== col) return <span style={{ opacity: 0.3 }}>↕</span>;
    return <span>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const hasFilters = search || filterStatus || filterSource;
  const clearFilters = () => { setSearch(''); setFilterStatus(''); setFilterSource(''); };

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
            {isCV ? (
            <>
              <span>Nowe: <strong style={{ color: COLORS.warning }}>{docsNew}</strong></span>
              <span>Ocenione: <strong style={{ color: COLORS.primary }}>{docsDescribed}</strong></span>
              <span>Zatwierdzone: <strong style={{ color: COLORS.success }}>{docsExported}</strong></span>
            </>
          ) : (
            <>
              <span>Nowe: <strong style={{ color: COLORS.warning }}>{docsNew}</strong></span>
              <span>Opisane: <strong style={{ color: COLORS.primary }}>{docsDescribed}</strong></span>
              <span>Wyeksportowane: <strong style={{ color: COLORS.success }}>{docsExported}</strong></span>
              {notExported > 0 && (
                <span style={{ color: COLORS.danger }}>⚠ Do eksportu: <strong>{notExported}</strong></span>
              )}
            </>
          )}
          </div>
        )}
      </div>

      {/* Filter bar */}
      {docsTotal > 0 && (
        <div style={{
          padding: '8px 12px', display: 'flex', gap: '8px', alignItems: 'center',
          borderBottom: `1px solid ${COLORS.border}`, flexShrink: 0, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '10px', color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: '500' }}>🔍</span>
          <input
            type="text" placeholder={isCV ? 'Szukaj (kandydat, stanowisko, umiejętności)...' : 'Szukaj (numer, kontrahent, NIP, kategoria)...'}
            value={search} onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, minWidth: '140px', padding: '5px 10px', fontSize: '12px',
              borderRadius: '6px', border: `1px solid ${COLORS.border}`,
              background: COLORS.bgTertiary, color: COLORS.text, outline: 'none',
            }}
          />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
            <option value="">Wszystkie statusy</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.icon} {v.label}</option>
            ))}
          </select>
          {uniqueSources.length > 1 && (
            <select value={filterSource} onChange={e => setFilterSource(e.target.value)} style={selectStyle}>
              <option value="">Wszystkie źródła</option>
              {uniqueSources.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
          {hasFilters && (
            <button onClick={clearFilters} style={{
              padding: '4px 8px', fontSize: '10px', borderRadius: '6px',
              border: `1px solid ${COLORS.border}`, background: 'transparent',
              color: COLORS.textMuted, cursor: 'pointer',
            }} title="Wyczyść filtry">✕</button>
          )}
          {hasFilters && (
            <span style={{ fontSize: '10px', color: COLORS.textMuted }}>
              {sorted.length} z {docsTotal}
            </span>
          )}
        </div>
      )}

      {/* Document list */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '0 12px' }}>
        {docsTotal > 0 ? (
          <>
          {/* Fixed header */}
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', flexShrink: 0 }}>
            <colgroup>
              {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <th style={{ padding: '10px 4px', textAlign: 'center', width: colWidths[0] }}>
                  <input type="checkbox"
                    checked={sorted.length > 0 && selectedDocs.length === sorted.length}
                    onChange={e => {
                      if (e.target.checked) {
                        setSelectedDocs(sorted.map(d => d.id));
                        navigate(`${taskPath}/selected`);
                      } else {
                        setSelectedDocs([]);
                      }
                    }}
                    style={{ cursor: 'pointer', accentColor: COLORS.primary }}
                  />
                </th>
                {columns.map(col => (
                  <th key={col.key}
                    onClick={() => handleSort(col.key)}
                    style={{
                      padding: '10px 8px', textAlign: col.align, fontSize: '10px',
                      color: sortCol === col.key ? COLORS.primary : COLORS.textMuted,
                      fontWeight: '500', textTransform: 'uppercase', cursor: 'pointer',
                      userSelect: 'none',
                    }}>
                    {col.label} {sortIndicator(col.key)}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
          {/* Scrollable body */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <tbody>
              {(() => {
                if (sorted.length === 0 && hasFilters) {
                  return (
                    <tr>
                      <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: COLORS.textMuted, fontSize: '13px' }}>
                        Brak dokumentów pasujących do filtrów
                        <div style={{ marginTop: '8px' }}>
                          <button onClick={clearFilters} style={{
                            padding: '4px 12px', fontSize: '11px', borderRadius: '6px',
                            border: `1px solid ${COLORS.border}`, background: COLORS.bgTertiary,
                            color: COLORS.text, cursor: 'pointer',
                          }}>Wyczyść filtry</button>
                        </div>
                      </td>
                    </tr>
                  );
                }
                const idCounts = {};
                documents.forEach(d => { if (d.doc_id) idCounts[d.doc_id] = (idCounts[d.doc_id] || 0) + 1; });
                return sorted.map(doc => {
                const status = STATUS_CONFIG[doc.status];
                const isDup = doc.doc_id && idCounts[doc.doc_id] > 1;
                const isChecked = selectedDocs.includes(doc.id);

                if (isCV) {
                  return (
                    <tr key={doc.id} onClick={() => navigate(`${taskPath}/document/${doc.id}`)}
                      style={{
                        borderBottom: `1px solid ${COLORS.border}`, cursor: 'pointer',
                        background: isChecked ? `${COLORS.primary}12` : selectedDocument?.id === doc.id ? COLORS.bgTertiary : 'transparent',
                      }}>
                      <td style={{ padding: '12px 4px', textAlign: 'center' }}>
                        <input type="checkbox" checked={isChecked}
                          onClick={e => e.stopPropagation()}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedDocs(prev => [...prev, doc.id]);
                              navigate(`${taskPath}/selected`);
                            } else {
                              setSelectedDocs(selectedDocs.filter(id => id !== doc.id));
                            }
                          }}
                          style={{ cursor: 'pointer', accentColor: COLORS.primary }}
                        />
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.contractor_name || doc.number || '—'}
                        </div>
                        <div style={{ fontSize: '10px', color: COLORS.textMuted }}>
                          {doc.contractor_nip || ''}
                        </div>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        {doc.metadata?.category ? (
                          <span style={{
                            fontSize: '11px', padding: '4px 8px', borderRadius: '4px',
                            background: `${COLORS.secondary}20`, color: COLORS.secondary,
                          }}>{doc.metadata.category}</span>
                        ) : (
                          <span style={{ color: COLORS.textMuted, fontSize: '11px', fontStyle: 'italic' }}>Brak stanowiska</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                          {(doc.metadata?.tags || []).slice(0, 4).map(t => (
                            <span key={t} style={{
                              fontSize: '10px', padding: '2px 6px', borderRadius: '10px',
                              background: `${COLORS.primary}15`, color: COLORS.primary,
                            }}>{t}</span>
                          ))}
                          {(doc.metadata?.tags || []).length > 4 && (
                            <span style={{ fontSize: '10px', color: COLORS.textMuted }}>+{doc.metadata.tags.length - 4}</span>
                          )}
                          {(doc.metadata?.tags || []).length === 0 && (
                            <span style={{ fontSize: '10px', color: COLORS.textMuted, fontStyle: 'italic' }}>—</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'center', fontSize: '12px', color: COLORS.textMuted }}>
                        {doc.document_date || '—'}
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '11px', padding: '4px 8px', borderRadius: '4px',
                          background: `${status?.color}20`, color: status?.color,
                        }}>{status?.icon} {status?.label}</span>
                      </td>
                      <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                        <span style={{ fontSize: '10px', color: COLORS.textMuted }}>{doc.source || '—'}</span>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={doc.id} onClick={() => navigate(`${taskPath}/document/${doc.id}`)}
                    style={{
                      borderBottom: `1px solid ${COLORS.border}`, cursor: 'pointer',
                      background: isChecked ? `${COLORS.primary}12` : selectedDocument?.id === doc.id ? COLORS.bgTertiary : isDup ? '#f59e0b08' : 'transparent',
                    }}>
                    <td style={{ padding: '12px 4px', textAlign: 'center' }}>
                      <input type="checkbox" checked={isChecked}
                        onClick={e => e.stopPropagation()}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedDocs(prev => [...prev, doc.id]);
                            navigate(`${taskPath}/selected`);
                          } else {
                            const remaining = selectedDocs.filter(id => id !== doc.id);
                            setSelectedDocs(remaining);
                          }
                        }}
                        style={{ cursor: 'pointer', accentColor: COLORS.primary }}
                      />
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <div style={{ fontSize: '13px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {isDup && <span title="Potencjalny duplikat" style={{ marginRight: '4px' }}>⚠️</span>}
                        {doc.number || '—'}
                      </div>
                      <div style={{ fontSize: '10px', color: COLORS.textMuted }}>{doc.document_date}</div>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <div style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.contractor_name || '—'}</div>
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
              });
              })()}
            </tbody>
          </table>
          </div>
          </>
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
