import React, { useState, useEffect } from 'react';
import { COLORS, ENTITY_TYPES, PROJECT_TYPES } from '../constants.js';

export default function MultiEntityView({ entities, setEntities, api, onSelectEntity, onCreateEntity }) {
  const [entityProjects, setEntityProjects] = useState({});
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    const loadAllProjects = async () => {
      setLoadingProjects(true);
      const projectMap = {};
      for (const entity of entities) {
        try {
          const projects = await api(`/projects?entity_id=${entity.id}`);
          projectMap[entity.id] = projects;
        } catch (e) {
          projectMap[entity.id] = [];
        }
      }
      setEntityProjects(projectMap);
      setLoadingProjects(false);
    };
    if (entities.length > 0) {
      loadAllProjects();
    } else {
      setLoadingProjects(false);
    }
  }, [entities]);

  const handleArchive = async (e, entity) => {
    e.stopPropagation();
    setActionLoading(entity.id);
    try {
      const updated = await api(`/entities/${entity.id}/archive`, { method: 'POST' });
      setEntities(prev => prev.map(en => en.id === entity.id ? updated : en));
    } catch (err) { /* ignore */ }
    finally { setActionLoading(null); }
  };

  const handleDelete = async (e, entity) => {
    e.stopPropagation();
    if (!confirm(`Usunąć podmiot "${entity.name}"? Ta operacja jest nieodwracalna.`)) return;
    setActionLoading(entity.id);
    try {
      await api(`/entities/${entity.id}`, { method: 'DELETE' });
      setEntities(prev => prev.filter(en => en.id !== entity.id));
    } catch (err) { /* ignore */ }
    finally { setActionLoading(null); }
  };

  const visibleEntities = showArchived ? entities : entities.filter(e => !e.is_archived);
  const archivedCount = entities.filter(e => e.is_archived).length;

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
            Podmioty i projekty
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: COLORS.textMuted }}>
            Widok dla księgowości — {visibleEntities.length} {visibleEntities.length === 1 ? 'podmiot' : visibleEntities.length < 5 ? 'podmioty' : 'podmiotów'}
            {archivedCount > 0 && !showArchived && ` · ${archivedCount} zarchiwizowanych`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {archivedCount > 0 && (
            <button
              onClick={() => setShowArchived(!showArchived)}
              style={{
                padding: '8px 14px',
                background: showArchived ? `${COLORS.warning}20` : COLORS.bgTertiary,
                border: `1px solid ${showArchived ? `${COLORS.warning}40` : COLORS.border}`,
                borderRadius: '8px',
                color: showArchived ? COLORS.warning : COLORS.textMuted,
                cursor: 'pointer', fontSize: '12px',
              }}
            >
              📦 {showArchived ? 'Ukryj archiwum' : `Archiwum (${archivedCount})`}
            </button>
          )}
          <button
            onClick={onCreateEntity}
            style={{
              padding: '10px 16px',
              background: COLORS.primary,
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
            }}
          >
            + Nowy podmiot
          </button>
        </div>
      </div>

      {loadingProjects ? (
        <div style={{ textAlign: 'center', padding: '60px', color: COLORS.textMuted }}>
          Ładowanie...
        </div>
      ) : visibleEntities.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '80px 20px',
          color: COLORS.textMuted,
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🏢</div>
          <div style={{ fontSize: '16px', marginBottom: '8px' }}>Brak podmiotów</div>
          <div style={{ fontSize: '13px' }}>Dodaj pierwszy podmiot, aby rozpocząć pracę</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '16px',
        }}>
          {visibleEntities.map(entity => {
            const projects = entityProjects[entity.id] || [];
            const typeInfo = ENTITY_TYPES[entity.type] || { icon: '🏢', label: entity.type };
            const isArchived = entity.is_archived;
            const isLoading = actionLoading === entity.id;

            return (
              <div
                key={entity.id}
                onClick={() => onSelectEntity(entity)}
                style={{
                  background: COLORS.bgSecondary,
                  border: `1px solid ${isArchived ? `${COLORS.warning}30` : COLORS.border}`,
                  borderRadius: '12px',
                  padding: '20px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, transform 0.15s',
                  opacity: isArchived ? 0.65 : 1,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = COLORS.borderHover;
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = isArchived ? `${COLORS.warning}30` : COLORS.border;
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {/* Entity header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '10px',
                    background: `${entity.color || COLORS.primary}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '22px',
                  }}>
                    {typeInfo.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', fontWeight: '600' }}>
                      {entity.name}
                      {isArchived && <span style={{ fontSize: '11px', color: COLORS.warning, marginLeft: '6px' }}>📦 archiwum</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: COLORS.textMuted }}>
                      {typeInfo.label} {entity.nip ? `· NIP: ${entity.nip}` : ''}
                    </div>
                  </div>
                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => handleArchive(e, entity)}
                      disabled={isLoading}
                      title={isArchived ? 'Przywróć z archiwum' : 'Archiwizuj'}
                      style={{
                        width: '28px', height: '28px', border: 'none', borderRadius: '6px',
                        background: COLORS.bgTertiary, color: COLORS.textMuted,
                        cursor: isLoading ? 'wait' : 'pointer', fontSize: '12px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >{isArchived ? '↩️' : '📦'}</button>
                    <button
                      onClick={(e) => handleDelete(e, entity)}
                      disabled={isLoading}
                      title="Usuń podmiot"
                      style={{
                        width: '28px', height: '28px', border: 'none', borderRadius: '6px',
                        background: COLORS.bgTertiary, color: '#ef4444',
                        cursor: isLoading ? 'wait' : 'pointer', fontSize: '12px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >🗑️</button>
                  </div>
                </div>

                {/* Projects list */}
                {projects.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {projects.map(project => {
                      const projType = PROJECT_TYPES[project.type] || { icon: '📁', label: project.type };
                      return (
                        <div
                          key={project.id}
                          style={{
                            padding: '10px 12px',
                            background: COLORS.bgTertiary,
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '14px' }}>{projType.icon}</span>
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: '500' }}>{project.name}</div>
                              {project.year && (
                                <div style={{ fontSize: '10px', color: COLORS.textMuted }}>{project.year}</div>
                              )}
                            </div>
                          </div>
                          <span style={{
                            fontSize: '10px',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: project.is_active ? `${COLORS.success}20` : `${COLORS.textMuted}20`,
                            color: project.is_active ? COLORS.success : COLORS.textMuted,
                          }}>
                            {project.is_active ? 'aktywny' : 'nieaktywny'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{
                    padding: '12px',
                    background: COLORS.bgTertiary,
                    borderRadius: '8px',
                    textAlign: 'center',
                    fontSize: '12px',
                    color: COLORS.textMuted,
                  }}>
                    Brak projektów
                  </div>
                )}

                {/* Footer stats */}
                <div style={{
                  marginTop: '12px',
                  paddingTop: '12px',
                  borderTop: `1px solid ${COLORS.border}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  color: COLORS.textMuted,
                }}>
                  <span>{projects.length} {projects.length === 1 ? 'projekt' : projects.length < 5 ? 'projekty' : 'projektów'}</span>
                  <span style={{ color: COLORS.primary }}>Otwórz →</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
