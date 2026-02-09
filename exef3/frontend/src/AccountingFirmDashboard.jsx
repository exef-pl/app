import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL } from './constants.js';

// ═══════════════════════════════════════════════════════════════════════════════
// EXEF - Widok Biura Rachunkowego
// Dashboard z wieloma klientami (delegowanymi tożsamościami)
// Dane pobierane z API: GET /api/v1/firm/dashboard
// ═══════════════════════════════════════════════════════════════════════════════

const STATUS_CONFIG = {
  in_progress: { label: 'W trakcie', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  warning: { label: 'Opóźniony', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  completed: { label: 'Gotowy', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
  exported: { label: 'Wyeksportowany', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)' },
};

const ENTITY_LABELS = {
  jdg: 'JDG', spolka: 'Sp. z o.o.', malzenstwo: 'Małżeństwo', organizacja: 'Organizacja',
};

export default function AccountingFirmDashboard({ api }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [view, setView] = useState('overview');
  const [selectedClientId, setSelectedClientId] = useState(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api('/firm/dashboard');
      setData(result);
    } catch (e) {
      setError(e.message || 'Błąd ładowania danych');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717a' }}>
        Ładowanie danych biura...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#ef4444', gap: '12px' }}>
        <div style={{ fontSize: '16px' }}>Błąd: {error}</div>
        <button onClick={loadDashboard} style={{
          padding: '10px 20px', background: '#3b82f6', border: 'none', borderRadius: '8px',
          color: '#fff', cursor: 'pointer', fontSize: '13px',
        }}>Ponów</button>
      </div>
    );
  }

  if (!data || !data.clients) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717a' }}>
        Brak danych biura. Zaloguj się jako księgowy z delegacjami.
      </div>
    );
  }

  const { firm, identity, clients, totals } = data;

  const clientsNeedingAttention = clients.filter(c =>
    c.projects.some(p => p.status === 'warning')
  );

  const filteredClients = filterStatus === 'all'
    ? clients
    : filterStatus === 'completed'
      ? clients.filter(c => c.projects.every(p => p.status === 'completed' || p.status === 'exported'))
      : clients.filter(c => c.projects.some(p => p.status === filterStatus));

  const descPct = totals.total > 0 ? Math.round((totals.described / totals.total) * 100) : 0;

  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>

        {/* Firm Badge */}
        {firm && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              background: 'rgba(139, 92, 246, 0.15)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              borderRadius: '12px', padding: '10px 18px',
            }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                background: `linear-gradient(135deg, ${firm.color || '#8b5cf6'}, ${firm.color || '#8b5cf6'}88)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: '700', fontSize: '18px',
              }}>
                {firm.icon || '🏢'}
              </div>
              <div>
                <div style={{ fontWeight: '600', fontSize: '15px' }}>{firm.name}</div>
                <div style={{ fontSize: '11px', color: '#a78bfa' }}>
                  NIP: {firm.nip} · {identity.first_name} {identity.last_name}
                </div>
              </div>
            </div>
            <div style={{ flex: 1 }} />
            <button onClick={loadDashboard} style={{
              padding: '10px 16px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '10px', color: '#e2e8f0', cursor: 'pointer', fontSize: '13px',
            }}>
              🔄 Odśwież
            </button>
          </div>
        )}

        {/* Stats Cards */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px',
        }}>
          <StatCard label="Klienci" value={totals.clients} sub="aktywnych delegacji"
            color="#a78bfa" bg="rgba(139, 92, 246, 0.1)" border="rgba(139, 92, 246, 0.2)" />
          <StatCard label="Dokumenty" value={totals.total} sub="w bieżących projektach"
            color="#60a5fa" bg="rgba(59, 130, 246, 0.1)" border="rgba(59, 130, 246, 0.2)" />
          <StatCard label="Opisanych" value={`${descPct}%`} sub={`${totals.described} / ${totals.total}`}
            color="#34d399" bg="rgba(16, 185, 129, 0.1)" border="rgba(16, 185, 129, 0.2)" />
          <StatCard label="Wymaga uwagi" value={clientsNeedingAttention.length} sub="klientów opóźnionych"
            color="#fbbf24" bg="rgba(245, 158, 11, 0.1)" border="rgba(245, 158, 11, 0.2)" />
          <StatCard label="Wyeksportowanych" value={totals.exported} sub="do wFirma/KPiR"
            color="#9ca3af" bg="rgba(107, 114, 128, 0.1)" border="rgba(107, 114, 128, 0.2)" />
        </div>

        {/* Filters & View Toggle */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { id: 'all', label: 'Wszyscy', count: clients.length },
              { id: 'warning', label: '⚠️ Opóźnieni', count: clientsNeedingAttention.length },
              { id: 'in_progress', label: 'W trakcie', count: clients.filter(c => c.projects.some(p => p.status === 'in_progress')).length },
              { id: 'completed', label: '✅ Gotowi', count: clients.filter(c => c.projects.every(p => p.status === 'completed' || p.status === 'exported')).length },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilterStatus(f.id)}
                style={{
                  padding: '8px 16px',
                  background: filterStatus === f.id ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${filterStatus === f.id ? 'rgba(139, 92, 246, 0.4)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: '8px',
                  color: filterStatus === f.id ? '#a78bfa' : '#94a3b8',
                  cursor: 'pointer', fontSize: '13px',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}
              >
                {f.label}
                <span style={{
                  background: filterStatus === f.id ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.1)',
                  padding: '2px 8px', borderRadius: '10px', fontSize: '11px',
                }}>{f.count}</span>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { id: 'overview', label: '📊 Przegląd' },
              { id: 'timeline', label: '📅 Timeline' },
              { id: 'exports', label: '📤 Eksporty' },
            ].map(v => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                style={{
                  padding: '8px 12px',
                  background: view === v.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                  border: 'none', borderRadius: '6px',
                  color: view === v.id ? '#fff' : '#64748b',
                  cursor: 'pointer', fontSize: '12px',
                }}
              >{v.label}</button>
            ))}
          </div>
        </div>

        {/* Clients Grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '16px',
        }}>
          {filteredClients.map(client => (
            <ClientCard
              key={client.id}
              client={client}
              isSelected={selectedClientId === client.id}
              onSelect={() => setSelectedClientId(client.id)}
              onNavigate={() => navigate(`/entity/${client.id}`)}
            />
          ))}

          {/* Add New Client Card */}
          <div style={{
            background: 'rgba(255,255,255,0.01)',
            border: '2px dashed rgba(139, 92, 246, 0.3)',
            borderRadius: '16px', padding: '40px 20px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.2s', minHeight: '280px',
          }}
          onClick={() => navigate('/entity/new')}
          >
            <div style={{
              width: '60px', height: '60px', borderRadius: '16px',
              background: 'rgba(139, 92, 246, 0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '24px', marginBottom: '16px',
            }}>👤</div>
            <div style={{ fontSize: '15px', fontWeight: '500', marginBottom: '8px' }}>
              Dodaj nowego klienta
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', maxWidth: '200px' }}>
              Zaproś klienta do delegacji lub dodaj podmiot ręcznie
            </div>
            <button style={{
              marginTop: '20px', padding: '10px 24px',
              background: 'linear-gradient(135deg, #8b5cf6, #a855f7)',
              border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer',
              fontSize: '13px', fontWeight: '500',
            }}>+ Dodaj klienta</button>
          </div>
        </div>

        {/* Monthly Summary Table */}
        <div style={{
          marginTop: '32px', background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', overflow: 'hidden',
        }}>
          <div style={{
            padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600' }}>
              📊 Podsumowanie klientów
            </h3>
            <button style={{
              padding: '8px 16px', background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px',
              color: '#34d399', cursor: 'pointer', fontSize: '12px',
            }}>📤 Eksportuj wszystkich gotowych</button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Klient', 'Projekty', 'Dokumenty', 'Opisane', 'Zatwierdzone', 'Wyeksport.', 'Progress', 'Akcje'].map(h => (
                  <th key={h} style={{
                    padding: '12px 16px', textAlign: h === 'Klient' ? 'left' : 'center',
                    fontSize: '11px', color: '#64748b', fontWeight: '500', textTransform: 'uppercase',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clients.map(client => {
                const cTotal = client.projects.reduce((s, p) => s + p.docs_total, 0);
                const cDescribed = client.projects.reduce((s, p) => s + p.docs_described, 0);
                const cApproved = client.projects.reduce((s, p) => s + p.docs_approved, 0);
                const cExported = client.projects.reduce((s, p) => s + p.docs_exported, 0);
                const progress = cTotal > 0 ? Math.round((cDescribed / cTotal) * 100) : 0;

                return (
                  <tr key={client.id}
                    onClick={() => navigate(`/entity/${client.id}`)}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer' }}
                  >
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '8px',
                          background: `${client.color || '#3b82f6'}40`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '16px',
                        }}>{client.icon || '🏢'}</div>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: '500' }}>{client.name}</div>
                          <div style={{ fontSize: '10px', color: '#64748b' }}>
                            NIP: {client.nip || '—'} · {ENTITY_LABELS[client.type] || client.type}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px' }}>
                      {client.projects.length}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: '14px', fontWeight: '600' }}>
                      {cTotal}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <span style={{ color: cDescribed === cTotal ? '#10b981' : '#60a5fa', fontWeight: '500' }}>
                        {cDescribed}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <span style={{ color: '#10b981', fontWeight: '500' }}>{cApproved}</span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <span style={{ color: '#6b7280', fontWeight: '500' }}>{cExported}</span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                        <div style={{
                          width: '60px', height: '6px', background: 'rgba(255,255,255,0.1)',
                          borderRadius: '3px', overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${progress}%`, height: '100%',
                            background: progress === 100 ? '#10b981' : '#3b82f6',
                          }} />
                        </div>
                        <span style={{ fontSize: '12px', color: progress === 100 ? '#10b981' : '#94a3b8' }}>
                          {progress}%
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button onClick={(e) => { e.stopPropagation(); navigate(`/entity/${client.id}`); }} style={{
                          padding: '6px 10px', background: 'rgba(59, 130, 246, 0.15)',
                          border: 'none', borderRadius: '6px', color: '#60a5fa',
                          cursor: 'pointer', fontSize: '11px',
                        }}>Otwórz</button>
                        <button
                          disabled={cApproved === 0}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            padding: '6px 10px',
                            background: cApproved > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.05)',
                            border: 'none', borderRadius: '6px',
                            color: cApproved > 0 ? '#34d399' : '#52525b',
                            cursor: cApproved > 0 ? 'pointer' : 'not-allowed', fontSize: '11px',
                          }}
                        >Eksportuj</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'rgba(139, 92, 246, 0.05)' }}>
                <td style={{ padding: '14px 16px', fontWeight: '600', fontSize: '13px' }}>
                  RAZEM ({clients.length} klientów)
                </td>
                <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: '600' }}>
                  {totals.projects}
                </td>
                <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: '700', fontSize: '15px' }}>
                  {totals.total}
                </td>
                <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: '600', color: '#60a5fa' }}>
                  {totals.described}
                </td>
                <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: '600', color: '#10b981' }}>
                  {totals.approved}
                </td>
                <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: '600', color: '#6b7280' }}>
                  {totals.exported}
                </td>
                <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: descPct === 100 ? '#10b981' : '#a78bfa' }}>
                    {descPct}%
                  </span>
                </td>
                <td style={{ padding: '14px 16px' }}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════════

function StatCard({ label, value, sub, color, bg, border }) {
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: '16px', padding: '20px' }}>
      <div style={{ fontSize: '12px', color, marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '32px', fontWeight: '700', color }}>{value}</div>
      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>{sub}</div>
    </div>
  );
}

function ClientCard({ client, isSelected, onSelect, onNavigate }) {
  const scopeIcons = [];
  if (client.delegation_scope?.can_view) scopeIcons.push({ icon: '👁️', title: 'Podgląd' });
  if (client.delegation_scope?.can_describe) scopeIcons.push({ icon: '📝', title: 'Opisywanie' });
  if (client.delegation_scope?.can_approve) scopeIcons.push({ icon: '✅', title: 'Zatwierdzanie' });
  if (client.delegation_scope?.can_export) scopeIcons.push({ icon: '📤', title: 'Eksport' });

  return (
    <div
      onClick={onSelect}
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid ${isSelected ? (client.color || '#3b82f6') : 'rgba(255,255,255,0.06)'}`,
        borderRadius: '16px', padding: '20px', cursor: 'pointer', transition: 'all 0.2s',
      }}
    >
      {/* Client Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: `linear-gradient(135deg, ${client.color || '#3b82f6'}, ${client.color || '#3b82f6'}77)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: '700', fontSize: '20px',
          }}>{client.icon || '🏢'}</div>
          <div>
            <div style={{ fontWeight: '600', fontSize: '15px' }}>{client.name}</div>
            <div style={{ fontSize: '12px', color: '#64748b' }}>
              NIP: {client.nip || '—'} · {ENTITY_LABELS[client.type] || client.type}
              {client.address_city ? ` · ${client.address_city}` : ''}
            </div>
            {client.owner_name && (
              <div style={{ fontSize: '11px', color: '#8b5cf6', marginTop: '2px' }}>
                Właściciel: {client.owner_name}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {scopeIcons.map((s, i) => (
            <span key={i} title={s.title} style={{ fontSize: '14px', opacity: 0.7 }}>{s.icon}</span>
          ))}
        </div>
      </div>

      {/* Projects */}
      {client.projects.map(project => (
        <ProjectRow key={project.id} project={project} />
      ))}

      {/* Quick Actions */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(); }}
          style={{
            flex: 1, padding: '10px',
            background: `${client.color || '#3b82f6'}20`,
            border: `1px solid ${client.color || '#3b82f6'}40`,
            borderRadius: '8px', color: client.color || '#3b82f6',
            cursor: 'pointer', fontSize: '12px', fontWeight: '500',
          }}
        >📋 Otwórz podmiot</button>
        <button
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1, padding: '10px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px', color: '#94a3b8',
            cursor: 'pointer', fontSize: '12px',
          }}
        >📝 Opisz dokumenty</button>
      </div>
    </div>
  );
}

function ProjectRow({ project }) {
  const total = project.docs_total || 0;
  const described = project.docs_described || 0;
  const approved = project.docs_approved || 0;
  const exported = project.docs_exported || 0;
  const toDescribe = total - described;
  const status = STATUS_CONFIG[project.status] || STATUS_CONFIG.in_progress;

  return (
    <div style={{
      background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '14px', marginBottom: '10px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '500' }}>{project.icon} {project.name}</div>
          {project.current_task && (
            <div style={{ fontSize: '11px', color: '#64748b' }}>Zadanie: {project.current_task}</div>
          )}
        </div>
        <span style={{
          fontSize: '10px', padding: '4px 10px', borderRadius: '6px',
          background: status.bg, color: status.color, fontWeight: '500',
        }}>{status.label}</span>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div style={{
          height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px',
          overflow: 'hidden', marginBottom: '10px',
        }}>
          <div style={{ display: 'flex', height: '100%' }}>
            <div style={{ width: `${(exported / total) * 100}%`, background: '#6b7280' }} />
            <div style={{ width: `${((approved - exported) / total) * 100}%`, background: '#10b981' }} />
            <div style={{ width: `${((described - approved) / total) * 100}%`, background: '#3b82f6' }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
        <div>
          <span style={{ color: '#64748b' }}>Do opisania: </span>
          <span style={{ color: toDescribe > 0 ? '#f59e0b' : '#10b981', fontWeight: '600' }}>{toDescribe}</span>
        </div>
        {project.deadline && (
          <div>
            <span style={{ color: '#64748b' }}>Termin: </span>
            <span style={{ color: project.status === 'warning' ? '#f59e0b' : '#94a3b8', fontWeight: '500' }}>
              {project.deadline}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
