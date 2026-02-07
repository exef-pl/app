# API Reference

Bazowy URL: `http://localhost:8003/api/v1`

Autoryzacja: `Authorization: Bearer {token}`

## Autentykacja

| Metoda | Endpoint | Opis |
|--------|----------|------|
| POST | `/auth/login` | Logowanie (form: username, password) |
| POST | `/auth/register` | Rejestracja |
| GET | `/auth/me` | Dane zalogowanego użytkownika |

## Podmioty (Entities)

| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | `/entities` | Lista podmiotów użytkownika |
| POST | `/entities` | Utwórz podmiot |
| GET | `/entities/{id}` | Szczegóły podmiotu |

## Projekty

| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | `/projects?entity_id=X` | Lista projektów podmiotu |
| POST | `/projects` | Utwórz projekt |
| PATCH | `/projects/{id}` | Aktualizuj projekt |
| DELETE | `/projects/{id}` | Usuń projekt |

## Zadania

| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | `/projects/{id}/tasks` | Lista zadań projektu |
| POST | `/tasks` | Utwórz zadanie |
| PATCH | `/tasks/{id}` | Aktualizuj zadanie |
| DELETE | `/tasks/{id}` | Usuń zadanie |

## Dokumenty

| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | `/tasks/{id}/documents` | Lista dokumentów zadania |
| POST | `/documents` | Utwórz dokument |
| PATCH | `/documents/{id}/metadata` | Aktualizuj metadane |
| DELETE | `/documents/{id}` | Usuń dokument |
| GET | `/documents/{id}/duplicates` | Duplikaty dokumentu |

## Duplikaty

| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | `/tasks/{id}/duplicates` | Grupy duplikatów w zadaniu |

Odpowiedź:

```json
{
  "groups": [{"doc_id": "DOC-FV-...", "documents": [...]}],
  "total_duplicates": 2
}
```

## Import / Eksport

| Metoda | Endpoint | Opis |
|--------|----------|------|
| POST | `/flow/import` | Uruchom import z źródła |
| POST | `/flow/upload-csv` | Upload pliku CSV |
| POST | `/flow/export` | Uruchom eksport |
| GET | `/export-runs/{id}/download` | Pobierz plik eksportu |

## Źródła danych

| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | `/sources?project_id=X` | Lista źródeł projektu |
| POST | `/sources` | Utwórz źródło |
| PATCH | `/sources/{id}` | Aktualizuj źródło |
| DELETE | `/sources/{id}` | Usuń źródło |
| POST | `/sources/{id}/test-connection` | Test połączenia |

## Bulk operations

| Metoda | Endpoint | Opis |
|--------|----------|------|
| POST | `/tasks/{id}/bulk-metadata` | Masowa aktualizacja metadanych |
