# Zarządzanie duplikatami

System EXEF automatycznie wykrywa i grupuje duplikaty dokumentów na podstawie deterministycznego identyfikatora `doc_id`.

## Jak działa deduplikacja?

### Identyfikator dokumentu (doc_id)

Każdy dokument otrzymuje unikalny identyfikator `doc_id` obliczany z:

1. **NIP kontrahenta** — znormalizowany (usunięcie spacji, myślników, prefiksu "PL")
2. **Numer faktury** — case-insensitive, trimmed
3. **Data dokumentu** — format YYYY-MM-DD
4. **Kwota brutto** — zaokrąglona do 2 miejsc po przecinku

Format: `DOC-FV-{SHA256[:16]}` (np. `DOC-FV-FA4620F557AA187C`)

### Automatyczne pomijanie przy imporcie

Podczas importu system:

1. Ładuje istniejące `doc_id` i `source_id` dla zadania
2. Dla każdego nowego dokumentu sprawdza czy `doc_id` lub `source_id` już istnieje
3. Jeśli tak — pomija dokument (nie tworzy duplikatu)
4. Loguje liczbę pominiętych dokumentów

### Wykrywanie duplikatów w UI

Dokumenty z takim samym `doc_id` są oznaczone ikoną ⚠️ w tabeli dokumentów.

## Zakładka Duplikaty

Zakładka **⚠️ Duplikaty** w prawym panelu pokazuje:

- **Grupy duplikatów** — dokumenty z tym samym `doc_id`
- **Oryginał** — pierwszy dokument w grupie (najstarszy)
- **Duplikaty** — kolejne dokumenty z tym samym `doc_id`

### Usuwanie duplikatów

Dwie opcje:

1. **Usuń pojedynczy duplikat** — kliknij 🗑️ Usuń przy konkretnym dokumencie, potwierdź
2. **Usuń wszystkie duplikaty w grupie** — kliknij "Usuń duplikaty" w nagłówku grupy (zachowuje oryginał)

!!! warning "Uwaga"
    Usunięcie dokumentu jest nieodwracalne. Oryginał nigdy nie jest usuwany automatycznie.

## API

### Pobranie duplikatów dla zadania

```
GET /api/v1/tasks/{task_id}/duplicates
```

Odpowiedź:

```json
{
  "groups": [
    {
      "doc_id": "DOC-FV-FA4620F557AA187C",
      "documents": [
        {"id": "...", "number": "FV/001/03/2026", "source": "ksef", ...},
        {"id": "...", "number": "FV/001/03/2026", "source": "email", ...}
      ]
    }
  ],
  "total_duplicates": 1
}
```

### Pobranie duplikatów dla dokumentu

```
GET /api/v1/documents/{document_id}/duplicates
```

Zwraca listę dokumentów z tym samym `doc_id` w tej samej encji (bez samego dokumentu).

### Usunięcie dokumentu

```
DELETE /api/v1/documents/{document_id}
```
