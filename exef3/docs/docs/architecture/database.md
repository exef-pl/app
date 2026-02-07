# Architektura bazy danych

## Baza główna (`exef.db`)

Przechowuje dane globalne:

- `identities` — użytkownicy
- `entities` — firmy/podmioty
- `entity_members` — powiązania użytkownik↔podmiot
- `entity_databases` — konfiguracja baz per-entity
- `project_templates` — szablony projektów
- `magic_links` — linki do logowania
- `resource_routing` — mapowanie resource_id → entity_nip

## Bazy per-entity (`data/entities/{nip}.db`)

Opcjonalne (włączane przez `USE_ENTITY_DB=true`). Każda firma ma osobną bazę:

- `projects`, `project_authorizations`
- `tasks`
- `documents`, `document_metadata`, `document_relations`
- `data_sources`, `import_runs`, `export_runs`

## Kluczowe modele

### Document

```python
class Document:
    id: str (UUID)
    task_id: str (FK → Task)
    doc_id: str           # deterministyczny identyfikator (deduplikacja)
    doc_type: str         # invoice, correction, receipt, ...
    number: str           # numer dokumentu
    contractor_name: str
    contractor_nip: str
    amount_net, amount_vat, amount_gross: float
    currency: str
    document_date: date
    source: str           # email, ksef, csv, ...
    source_id: str        # unikalny ID w źródle
    status: DocumentStatus  # new, described, approved, exported
```

### Task

```python
class Task:
    id: str (UUID)
    project_id: str (FK → Project)
    name: str
    period_start, period_end: date
    import_status, describe_status, export_status: PhaseStatus
    docs_total, docs_described, docs_exported: int
```

### DataSource

```python
class DataSource:
    id: str (UUID)
    project_id: str (FK → Project)
    name: str
    source_type: SourceType  # email, ksef, csv, wfirma, jpk_pkpir, ...
    direction: SourceDirection  # import, export
    config: dict (JSON)
```
