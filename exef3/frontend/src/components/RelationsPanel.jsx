import React, { useState, useEffect, useCallback } from 'react';
import { COLORS, API_URL } from '../constants.js';

// ═══════════════════════════════════════════════════════════════════════════════
// RELATION TYPES (mirrors backend RELATION_TYPES)
// ═══════════════════════════════════════════════════════════════════════════════

const RELATION_TYPES = {
  payment:             { label: 'Płatność',         icon: '💰', reverseLabel: 'Faktura' },
  correction:          { label: 'Korekta',          icon: '✏️', reverseLabel: 'Dokument korygowany' },
  contract_to_invoice: { label: 'Faktura do umowy', icon: '📝', reverseLabel: 'Umowa' },
  attachment:          { label: 'Załącznik',        icon: '📎', reverseLabel: 'Dokument główny' },
  duplicate:           { label: 'Duplikat',         icon: '📋', reverseLabel: 'Oryginał' },
  related:             { label: 'Powiązany',        icon: '🔗', reverseLabel: 'Powiązany' },
};

const MATCH_REASON_LABELS = {
  nip_match:     'NIP',
  amount_exact:  'Kwota identyczna',
  amount_close:  'Kwota zbliżona',
  amount_similar:'Kwota podobna',
  name_exact:    'Kontrahent identyczny',
  name_partial:  'Kontrahent podobny',
  name_words:    'Nazwa częściowa',
  date_close:    'Data bliska',
  date_month:    'Ten sam miesiąc',
};

// ═══════════════════════════════════════════════════════════════════════════════
// RelationsPanel — shows linked documents below document detail
// ═══════════════════════════════════════════════════════════════════════════════

export default function RelationsPanel({ documentId, api }) {
  const [relations, setRelations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLinkModal, setShowLinkModal] = useState(false);

  const loadRelations = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    try {
      const data = await api(`/relations/documents/${documentId}`);
      setRelations(data);
    } catch {
      setRelations([]);
    } finally {
      setLoading(false);
    }
  }, [documentId, api]);

  useEffect(() => { loadRelations(); }, [loadRelations]);

  const handleUnlink = async (relationId) => {
    try {
      await api(`/documents/relations/${relationId}`, { method: 'DELETE' });
      setRelations(prev => prev.filter(r => r.id !== relationId));
    } catch (e) {
      console.error('Unlink failed:', e);
    }
  };

  return (
    <>
      <div style={{
        padding: '12px',
        background: COLORS.bgTertiary,
        borderRadius: '8px',
        marginBottom: '16px',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: relations.length > 0 ? '10px' : '0',
        }}>
          <div style={{ fontSize: '10px', color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: '600' }}>
            🔗 Powiązania ({relations.length})
          </div>
          <button
            onClick={() => setShowLinkModal(true)}
            style={{
              background: 'transparent', border: `1px solid ${COLORS.border}`,
              borderRadius: '6px', padding: '4px 10px', fontSize: '11px',
              color: COLORS.primary, cursor: 'pointer', fontWeight: '500',
            }}
          >+ Powiąż</button>
        </div>

        {loading && <div style={{ fontSize: '11px', color: COLORS.textMuted, padding: '8px 0' }}>Ładowanie...</div>}

        {!loading && relations.length === 0 && (
          <div style={{ fontSize: '11px', color: COLORS.textMuted, padding: '4px 0' }}>
            Brak powiązań — kliknij „+ Powiąż" aby połączyć z innym dokumentem
          </div>
        )}

        {relations.map(rel => {
          const rt = RELATION_TYPES[rel.relation_type] || RELATION_TYPES.related;
          const doc = rel.linked_document;
          const label = rel.direction === 'child' ? rt.label : rt.reverseLabel;
          return (
            <div key={rel.id} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px', background: COLORS.bgSecondary, borderRadius: '6px',
              marginBottom: '4px', fontSize: '12px',
            }}>
              <span style={{ fontSize: '14px' }}>{rt.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    fontSize: '9px', color: COLORS.primary, textTransform: 'uppercase',
                    fontWeight: '600', letterSpacing: '0.5px',
                  }}>{label}</span>
                  <span style={{
                    fontSize: '9px', color: COLORS.textMuted, background: COLORS.bgTertiary,
                    padding: '1px 5px', borderRadius: '3px',
                  }}>{doc.project_name}</span>
                </div>
                <div style={{
                  fontWeight: '500', color: COLORS.text, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px',
                }}>
                  {doc.number || doc.contractor_name || doc.id.slice(0, 8)}
                </div>
                <div style={{ fontSize: '11px', color: COLORS.textMuted, marginTop: '1px' }}>
                  {doc.contractor_name && doc.number ? doc.contractor_name : ''}
                  {doc.amount_gross ? ` · ${doc.amount_gross.toFixed(2)} ${doc.currency}` : ''}
                  {doc.document_date ? ` · ${doc.document_date}` : ''}
                </div>
              </div>
              <button
                onClick={() => handleUnlink(rel.id)}
                title="Usuń powiązanie"
                style={{
                  background: 'transparent', border: 'none', color: COLORS.textMuted,
                  cursor: 'pointer', fontSize: '14px', padding: '2px 4px',
                  borderRadius: '4px', flexShrink: 0,
                }}
              >×</button>
            </div>
          );
        })}
      </div>

      {showLinkModal && (
        <LinkDocumentModal
          documentId={documentId}
          api={api}
          onClose={() => setShowLinkModal(false)}
          onLinked={() => { loadRelations(); setShowLinkModal(false); }}
        />
      )}
    </>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// LinkDocumentModal — search + auto-match + link
// ═══════════════════════════════════════════════════════════════════════════════

function LinkDocumentModal({ documentId, api, onClose, onLinked }) {
  const [tab, setTab] = useState('suggestions'); // 'suggestions' | 'search'
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [relationType, setRelationType] = useState('payment');
  const [linking, setLinking] = useState(null); // doc id being linked

  // Load auto-match suggestions on mount
  useEffect(() => {
    (async () => {
      try {
        const data = await api(`/match/documents/${documentId}?limit=15`);
        setSuggestions(data);
      } catch {
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    })();
  }, [documentId, api]);

  // Search with debounce
  useEffect(() => {
    if (tab !== 'search' || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const data = await api(`/search/documents?q=${encodeURIComponent(query)}&exclude_document_id=${documentId}&limit=20`);
        setSearchResults(data);
      } catch {
        setSearchResults([]);
      } finally {
        setLoadingSearch(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, tab, documentId, api]);

  const handleLink = async (targetDocId) => {
    setLinking(targetDocId);
    try {
      await api('/documents/relations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_id: documentId,
          child_id: targetDocId,
          relation_type: relationType,
        }),
      });
      onLinked();
    } catch (e) {
      alert(e.message || 'Błąd tworzenia powiązania');
    } finally {
      setLinking(null);
    }
  };

  const overlayStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.5)', zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  const modalStyle = {
    background: COLORS.bgPrimary, borderRadius: '12px',
    width: '520px', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
    border: `1px solid ${COLORS.border}`, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
  };

  const tabStyle = (active) => ({
    flex: 1, padding: '10px', border: 'none', fontSize: '12px', fontWeight: '500',
    background: active ? COLORS.primary : 'transparent',
    color: active ? '#fff' : COLORS.textMuted,
    cursor: 'pointer',
  });

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          padding: '16px', borderBottom: `1px solid ${COLORS.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: COLORS.text }}>
            🔗 Powiąż dokument
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: COLORS.textMuted,
            cursor: 'pointer', fontSize: '18px',
          }}>×</button>
        </div>

        {/* Relation type selector */}
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${COLORS.border}` }}>
          <label style={{ fontSize: '11px', color: COLORS.textMuted, display: 'block', marginBottom: '6px' }}>
            Typ powiązania
          </label>
          <select
            value={relationType}
            onChange={e => setRelationType(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px', fontSize: '13px',
              background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
              borderRadius: '6px', color: COLORS.text,
            }}
          >
            {Object.entries(RELATION_TYPES).map(([key, rt]) => (
              <option key={key} value={key}>{rt.icon} {rt.label}</option>
            ))}
          </select>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', background: COLORS.bgTertiary,
          borderBottom: `1px solid ${COLORS.border}`,
        }}>
          <button style={tabStyle(tab === 'suggestions')} onClick={() => setTab('suggestions')}>
            ✨ Sugestie ({suggestions.length})
          </button>
          <button style={tabStyle(tab === 'search')} onClick={() => setTab('search')}>
            🔍 Szukaj
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
          {tab === 'suggestions' && (
            <>
              {loadingSuggestions && (
                <div style={{ textAlign: 'center', padding: '20px', color: COLORS.textMuted, fontSize: '12px' }}>
                  Szukam dopasowań...
                </div>
              )}
              {!loadingSuggestions && suggestions.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px', color: COLORS.textMuted, fontSize: '12px' }}>
                  Brak automatycznych dopasowań — użyj zakładki „Szukaj"
                </div>
              )}
              {suggestions.map(s => (
                <DocumentResultCard
                  key={s.document.id}
                  doc={s.document}
                  score={s.score}
                  matchReasons={s.match_reasons}
                  onLink={() => handleLink(s.document.id)}
                  linking={linking === s.document.id}
                />
              ))}
            </>
          )}

          {tab === 'search' && (
            <>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Szukaj po numerze, kontrahencie, NIP, kwocie..."
                autoFocus
                style={{
                  width: '100%', padding: '10px 12px', fontSize: '13px',
                  background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
                  borderRadius: '8px', color: COLORS.text, marginBottom: '12px',
                  boxSizing: 'border-box',
                }}
              />
              {loadingSearch && (
                <div style={{ textAlign: 'center', padding: '12px', color: COLORS.textMuted, fontSize: '12px' }}>
                  Szukam...
                </div>
              )}
              {!loadingSearch && query.length >= 2 && searchResults.length === 0 && (
                <div style={{ textAlign: 'center', padding: '12px', color: COLORS.textMuted, fontSize: '12px' }}>
                  Brak wyników dla „{query}"
                </div>
              )}
              {searchResults.map(doc => (
                <DocumentResultCard
                  key={doc.id}
                  doc={doc}
                  onLink={() => handleLink(doc.id)}
                  linking={linking === doc.id}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// DocumentResultCard — single search/suggestion result
// ═══════════════════════════════════════════════════════════════════════════════

function DocumentResultCard({ doc, score, matchReasons, onLink, linking }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '10px', background: COLORS.bgSecondary, borderRadius: '8px',
      marginBottom: '6px', border: `1px solid ${COLORS.border}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
          <span style={{
            fontSize: '13px', fontWeight: '500', color: COLORS.text,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {doc.number || doc.contractor_name || doc.id.slice(0, 8)}
          </span>
          {score != null && (
            <span style={{
              fontSize: '10px', fontWeight: '600',
              color: score >= 0.6 ? COLORS.success : score >= 0.3 ? COLORS.warning : COLORS.textMuted,
              background: score >= 0.6 ? '#22c55e15' : score >= 0.3 ? '#f59e0b15' : COLORS.bgTertiary,
              padding: '1px 6px', borderRadius: '4px',
            }}>
              {Math.round(score * 100)}%
            </span>
          )}
        </div>
        <div style={{ fontSize: '11px', color: COLORS.textMuted }}>
          {doc.contractor_name && doc.number ? doc.contractor_name + ' · ' : ''}
          {doc.amount_gross ? `${doc.amount_gross.toFixed(2)} ${doc.currency}` : ''}
          {doc.document_date ? ` · ${doc.document_date}` : ''}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
          <span style={{
            fontSize: '9px', color: COLORS.textMuted, background: COLORS.bgTertiary,
            padding: '1px 5px', borderRadius: '3px',
          }}>{doc.project_name}</span>
          <span style={{
            fontSize: '9px', color: COLORS.textMuted, background: COLORS.bgTertiary,
            padding: '1px 5px', borderRadius: '3px',
          }}>{doc.task_name}</span>
          {matchReasons && matchReasons.map(r => (
            <span key={r} style={{
              fontSize: '9px', color: COLORS.primary, background: `${COLORS.primary}15`,
              padding: '1px 5px', borderRadius: '3px',
            }}>{MATCH_REASON_LABELS[r] || r}</span>
          ))}
        </div>
      </div>
      <button
        onClick={onLink}
        disabled={linking}
        style={{
          background: linking ? COLORS.bgTertiary : COLORS.primary,
          border: 'none', borderRadius: '6px', padding: '6px 14px',
          color: '#fff', fontSize: '12px', fontWeight: '500',
          cursor: linking ? 'wait' : 'pointer', flexShrink: 0,
          opacity: linking ? 0.6 : 1,
        }}
      >
        {linking ? '...' : '🔗 Powiąż'}
      </button>
    </div>
  );
}
