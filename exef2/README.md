# EXEF - Minimal Document Flow Engine

Minimalistyczna aplikacja do zarządzania dokumentami z komunikacją endpoint-to-endpoint.

## Architektura

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   IMPORT    │────▶│  DOCUMENTS  │────▶│   EXPORT    │
│  Endpoints  │     │   Storage   │     │  Endpoints  │
└─────────────┘     └─────────────┘     └─────────────┘
     │                    │                    │
     │  Email/KSeF/      │  SQLite DB        │  wFirma/KSeF/
     │  Scanner/         │  (local)          │  Printer/
     │  Webhook          │                    │  Webhook
```

## Statystyki kodu

| Komponent | Linie kodu | Opis |
|-----------|------------|------|
| Backend   | ~180 LOC   | FastAPI, SQLite, WebSocket |
| Frontend  | ~200 LOC   | Alpine.js, single HTML |
| Tests     | ~200 LOC   | Pytest + Playwright |
| Docker    | ~50 LOC    | 3 Dockerfiles + compose |
| **Total** | **~630 LOC** | Pełna aplikacja |

## Szybki start

```bash
# Start
make up

# Otwórz http://localhost:3000

# Testy
make test

# Stop
make down
```

## API Endpoints

### Dokumenty
- `GET /api/documents` - Lista dokumentów
- `POST /api/documents` - Utwórz dokument
- `PATCH /api/documents/{id}` - Aktualizuj status
- `DELETE /api/documents/{id}` - Usuń dokument

### Endpointy (Import/Export)
- `GET /api/endpoints` - Lista endpointów
- `POST /api/endpoints` - Dodaj endpoint
- `DELETE /api/endpoints/{id}` - Usuń endpoint

### Flow (Transfer)
- `POST /api/flow/pull/{endpoint_id}` - Pobierz z importu
- `POST /api/flow/push/{endpoint_id}` - Wyślij do eksportu

### Webhook
- `POST /api/webhook/receive/{endpoint_id}` - Odbierz dokument z zewnętrznego systemu

### WebSocket
- `WS /ws` - Real-time updates

## Typy Endpointów

### Import
| Typ | Opis |
|-----|------|
| `email` | IMAP - pobieranie załączników |
| `ksef` | KSeF API - faktury zakupowe |
| `scanner` | Skaner dokumentów |
| `webhook` | HTTP webhook - zewnętrzne systemy |

### Export
| Typ | Opis |
|-----|------|
| `ksef` | KSeF API - faktury sprzedażowe |
| `wfirma` | Export CSV do wFirma |
| `printer` | Drukarka |
| `webhook` | HTTP webhook - zewnętrzne systemy |

## Przepływ dokumentu

```
created → described → signed → exported
   │          │          │         │
   │          │          │         └── Push to export endpoint
   │          │          └── Zatwierdzenie/podpis
   │          └── Kategoryzacja/opis
   └── Import lub ręczne utworzenie
```

## Przykłady API

### Utwórz dokument
```bash
curl -X POST http://localhost:3000/api/documents \
  -H "Content-Type: application/json" \
  -d '{"type":"invoice","number":"FV/2026/01/001","contractor":"ACME","amount":1000}'
```

### Dodaj endpoint importu
```bash
curl -X POST http://localhost:3000/api/endpoints \
  -H "Content-Type: application/json" \
  -d '{"type":"ksef","direction":"import","name":"KSeF Zakupy"}'
```

### Pobierz dokumenty z endpointu
```bash
curl -X POST http://localhost:3000/api/flow/pull/{endpoint_id}
```

### Webhook - odbierz dokument
```bash
curl -X POST http://localhost:3000/api/webhook/receive/{endpoint_id} \
  -H "Content-Type: application/json" \
  -d '{"type":"invoice","number":"EXT-001","contractor":"External","amount":500}'
```

## Rozszerzanie

### Dodanie nowego adaptera importu/exportu

W `main.py` w funkcjach `adapter_pull` i `adapter_push`:

```python
async def adapter_pull(ep: dict) -> list[dict]:
    t = ep["type"]
    if t == "my_new_source":
        # Twoja implementacja pobierania
        return [{"type": "invoice", "number": "...", ...}]
    # ...

async def adapter_push(ep: dict, docs: list[dict]) -> bool:
    t = ep["type"]
    if t == "my_new_target":
        # Twoja implementacja wysyłania
        return True
    # ...
```

## Licencja

Apache Software
