# ExEF CLI - Dokumentacja

## Instalacja

### Z npm (lokalna instalacja)

```bash
cd exef
npm install
npm link  # instaluje globalnie jako 'exef'
```

### Bezpośrednie użycie

```bash
node bin/exef.cjs <komenda>
# lub
npm run cli -- <komenda>
```

### Binarka standalone

```bash
npm run build:cli
./dist/exef <komenda>
```

## Komendy

### Ogólne

| Komenda | Opis |
| -------- | ---- |
| `exef help` | Wyświetl pomoc |
| `exef version` | Wyświetl wersję |
| `exef health` | Sprawdź status usługi |

### Dane / baza (SQLite)

| Komenda | Opis |
| -------- | ---- |
| `exef data export [--output plik.json]` | Eksport całej bazy do JSON (bundle) |
| `exef data import --file plik.json` | Import całej bazy z JSON (bundle) |
| `exef data export-entity <entity> [--output plik.json]` | Eksport encji: `projects`, `labels`, `expense-types`, `invoices`, `contractors`, `settings` |
| `exef data import-entity <entity> --file plik.json` | Import encji (format jak w eksporcie) |
| `exef db export [--output exef.sqlite]` | Eksport pliku SQLite |
| `exef db import --file exef.sqlite` | Import pliku SQLite |
| `exef contractors list` | Lista kontrahentów (wyciągana z faktur) |

### UI (motyw / kontrast)

| Komenda | Opis |
| -------- | ---- |
| `exef ui theme get` | Pobierz motyw UI (`white/dark/warm`) |
| `exef ui theme set --theme white/dark/warm` | Ustaw motyw UI |
| `exef ui contrast --palette plik.json` | Raport kontrastu (WCAG) dla palety |

### Skrzynka faktur (inbox)

| Komenda | Opis |
| -------- | ---- |
| `exef inbox list` | Lista faktur |
| `exef inbox stats` | Statystyki |
| `exef inbox get <id>` | Szczegóły faktury |
| `exef inbox add` | Dodaj fakturę |
| `exef inbox process <id>` | Przetwórz (OCR) |
| `exef inbox approve <id>` | Zatwierdź |
| `exef inbox reject <id>` | Odrzuć |
| `exef inbox export` | Eksportuj |
| `exef inbox export-files --output-dir DIR [--status approved/all] [--project P1,P2] [--expense-type T1,T2] [--ids ID1,ID2] [--source scanner/email/storage/ksef] [--since YYYY-MM-DD]` | Eksportuj pliki faktur do folderów: `[typ wydatku]/[projekt]/[dokument]` |

### KSeF

| Komenda | Opis |
| -------- | ---- |
| `exef ksef auth` | Autoryzacja tokenem |
| `exef ksef session open` | Otwórz sesję |
| `exef ksef session close` | Zamknij sesję |
| `exef ksef poll` | Pobierz nowe faktury |
| `exef ksef send` | Wyślij fakturę |
| `exef ksef status <ref>` | Status faktury |
| `exef ksef download <nr>` | Pobierz fakturę |

## Opcje globalne

| Opcja | Opis |
| ----- | ---- |
| `--url <url>` | URL API (domyślnie: `http://127.0.0.1:3030`) |
| `--json` | Wynik w formacie JSON |
| `--quiet, -q` | Tryb cichy |
| `--help, -h` | Pomoc |

## Zmienne środowiskowe

| Zmienna | Opis |
| ------- | ---- |
| `EXEF_API_URL` | URL API |
| `EXEF_OUTPUT_FORMAT` | Format wyjścia: `json` lub `text` |
| `EXEF_STORAGE_BACKEND` | Backend storage: `files` lub `sqlite` |
| `EXEF_DB_PATH` | Ścieżka do pliku SQLite (gdy `EXEF_STORAGE_BACKEND=sqlite`) |

Uwaga: przy `EXEF_STORAGE_BACKEND=sqlite` pliki faktur (PDF/JPG/PNG/XML) są zapisywane w bazie jako BLOB.
Eksport `exef db export` zawiera te pliki, natomiast `exef data export` (bundle JSON) może nie zawierać treści plików.

## Przykłady użycia

### Zarządzanie fakturami

```bash
# Lista wszystkich faktur
exef inbox list

# Lista faktur oczekujących
exef inbox list --status pending

# Lista faktur ze skanera
exef inbox list --source scanner

# Wynik w JSON
exef inbox list --json

# Statystyki
exef inbox stats

# Szczegóły faktury
exef inbox get abc123
```

### Dodawanie faktur

```bash
# Dodaj plik PDF ze skanera
exef inbox add --file faktura.pdf --source scanner

# Dodaj fakturę XML z KSeF
exef inbox add --file faktura.xml --source ksef

# Dodaj z metadanymi
exef inbox add --file faktura.pdf \
  --nip 1234567890 \
  --name "Firma Sp. z o.o." \
  --amount 1230.00 \
  --number "FV/2026/01/001" \
  --date 2026-01-22
```

### Przetwarzanie faktur

```bash
# Przetwórz (OCR + auto-opis)
exef inbox process abc123

# Zatwierdź z kategorią
exef inbox approve abc123 --category hosting --mpk IT-001

# Odrzuć z powodem
exef inbox reject abc123 --reason "Duplikat"
```

### Eksport

```bash
# Eksport do CSV
exef inbox export --format csv --output faktury.csv

# Eksport do JSON
exef inbox export --format json --output faktury.json

# Eksport plików faktur (PDF/JPG/PNG/XML) do folderów wg typu wydatku i projektu
exef inbox export-files --output-dir ./exported --status approved

# Eksport tylko dla wybranych projektów
exef inbox export-files --output-dir ./exported --project PRJ-001,PRJ-002

# Eksport tylko dla wybranych typów wydatków
exef inbox export-files --output-dir ./exported --expense-type ET-01,ET-02

# Eksport tylko wskazanych faktur
exef inbox export-files --output-dir ./exported --ids abc123,def456

# Eksport po źródle i od daty
exef inbox export-files --output-dir ./exported --source storage --since 2026-01-01
```

### Integracja z KSeF

```bash
# Autoryzacja
exef ksef auth --token ABCD1234 --nip 1234567890

# Pobierz nowe faktury
exef ksef poll --since 2026-01-01

# Wyślij fakturę
exef ksef send --file faktura.xml

# Sprawdź status
exef ksef status ABC123456

# Pobierz fakturę
exef ksef download 1234567890-20260122-ABCDEF123456-01 --output faktura.xml
```

## Mapowanie CLI ↔ REST API

| CLI | REST API |
| --- | -------- |
| `exef health` | `GET /health` |
| `exef inbox list` | `GET /inbox/invoices` |
| `exef inbox stats` | `GET /inbox/stats` |
| `exef inbox get <id>` | `GET /inbox/invoices/:id` |
| `exef inbox add` | `POST /inbox/invoices` |
| `exef inbox process <id>` | `POST /inbox/invoices/:id/process` |
| `exef inbox approve <id>` | `POST /inbox/invoices/:id/approve` |
| `exef inbox reject <id>` | `POST /inbox/invoices/:id/reject` |
| `exef inbox export` | `POST /inbox/export` |
| `exef inbox export-files` | `POST /inbox/export/files` |
| `exef ksef auth` | `POST /ksef/auth/token` |
| `exef ksef session open` | `POST /ksef/sessions/online/open` |
| `exef ksef session close` | `POST /ksef/sessions/online/close` |
| `exef ksef poll` | `POST /inbox/ksef/poll` |
| `exef ksef send` | `POST /ksef/sessions/online/send` |
| `exef ksef status` | `POST /ksef/invoices/status` |
| `exef ksef download` | `POST /ksef/invoices/download` |
| `exef data export` | `GET /data/export` |
| `exef data import` | `POST /data/import` |
| `exef data export-entity <entity>` | `GET /data/export/:entity` |
| `exef data import-entity <entity>` | `POST /data/import/:entity` |
| `exef db export` | `GET /db/export.sqlite` |
| `exef db import` | `POST /db/import.sqlite` |
| `exef contractors list` | `GET /contractors` |
| `exef ui theme get` | `GET /ui/theme` |
| `exef ui theme set` | `PUT /ui/theme` |
| `exef ui contrast` | `POST /ui/contrast/report` |

## Integracja z shell

### Skrypty automatyzacji

```bash
#!/bin/bash
# sync-invoices.sh - pobierz faktury z KSeF i przetwórz

# Pobierz nowe faktury
exef ksef poll --since "$(date -d '7 days ago' +%Y-%m-%d)" --json

# Przetwórz oczekujące
for id in $(exef inbox list --status pending --json | jq -r '.invoices[].id'); do
  echo "Przetwarzanie: $id"
  exef inbox process "$id" --quiet
done

# Eksportuj zatwierdzone
exef inbox export --format csv --output "faktury-$(date +%Y%m%d).csv"
```

### Cron job

```cron
# Pobieraj faktury z KSeF co godzinę
0 * * * * /usr/local/bin/exef ksef poll --quiet

# Eksportuj zatwierdzone codziennie o 6:00
0 6 * * * /usr/local/bin/exef inbox export --format csv --output /data/faktury-$(date +\%Y\%m\%d).csv
```

### Pipe i filtrowanie

```bash
# Pokaż tylko faktury powyżej 1000 PLN
exef inbox list --json | jq '.invoices[] | select(.grossAmount > 1000)'

# Zlicz faktury wg statusu
exef inbox stats --json | jq '.byStatus'

# Eksportuj i wyślij mailem
exef inbox export --format csv | mail -s "Faktury" ksiegowosc@firma.pl
```

## Kody wyjścia

| Kod | Znaczenie |
| --- | --------- |
| 0 | Sukces |
| 1 | Błąd (komunikat na stderr) |

## Debugowanie

```bash
# Włącz verbose logging
DEBUG=exef* exef inbox list

# Sprawdź połączenie
exef health --url http://192.168.1.100:3030
```
