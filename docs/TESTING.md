# Testowanie

## 📚 Nawigacja

- **[⬅️ Powrót](README.md)** — główna dokumentacja
- **[🤝 Kontrybucja](CONTRIBUTING.md)** — zasady współpracy

---

Ten monorepo-agregator zawiera różne projekty (submoduły) oraz nowy projekt `exef/`. Poniżej są zasady testowania.

## 🐍 Testy (Python SDK: `ksef-client-python`)

Testy uruchamiane są przez pytest. W CI wykonywane są również statyczne kontrole jakości (ruff, mypy) oraz weryfikacja pokrycia kodu.

Instalacja zależności testowych:

```bash
pip install -r requirements-dev.txt
```

Uruchomienie testów:

```bash
pytest
```

Uruchomienie testów z kontrolą pokrycia:

```bash
pytest --cov=ksef_client --cov-report=term-missing --cov-fail-under=100
```

Testy E2E (marker e2e) są wyłączone w standardowym przebiegu i wymagają osobnej konfiguracji środowiska oraz danych dostępowych.

Uwaga: powyższe komendy dotyczą repozytorium `ksef-client-python/` (uruchamiaj je w tym katalogu).

## 🔄 Testy E2E (agregator / `exef/`)

W katalogu głównym są dodane testy E2E w pytest (marker `e2e`). Domyślnie są wyłączone.

Instalacja zależności testowych (root):

```bash
pip install -r requirements-dev.txt
```

Uruchomienie testów bez E2E:

```bash
pytest
```

Uruchomienie E2E:

```bash
pytest -m e2e
```

E2E uruchamia procesy Node z `exef/` i sprawdza endpointy `/health`.

### KSeF w testach (bez dostępu do gov)

W ramach testów `exef/` (CLI + API + E2E) KSeF jest traktowany jako **integracja opcjonalna**.

- W trybie testowym (`NODE_ENV=test`) część operacji KSeF jest **stubowana** tak, żeby testy nie wymagały połączenia z `api-*.ksef.mf.gov.pl` ani prawdziwych danych z gov.
- `exef ksef auth` zwraca token testowy (stub) i zapisuje go do `settings.channels.ksef.accounts`.
- `exef ksef poll` w `NODE_ENV=test` zwraca pustą listę (0 faktur), co pozwala uruchamiać testy offline.

Jeżeli chcesz testować **realne środowisko KSeF (demo/test)**, wtedy potrzebujesz prawdziwego tokena/kluczy/certyfikatów – patrz sekcja poniżej.

### 🖥️ Desktop E2E

Test desktop jest smoke-testem i może wymagać:

- zainstalowanych zależności Node w `exef/` (`npm --prefix exef install`),
- środowiska z GUI (np. `DISPLAY` na Linux) — w przeciwnym razie test zostanie pominięty.

---

## 🚀 Szybkie testy

```bash
# Testy jednostkowe (bez E2E)
pytest

# Testy E2E tylko
pytest -m e2e

# Wszystkie testy z pokryciem
pytest --cov=ksef_client --cov-report=term-missing

# Testy w konkretnym projekcie
cd ksef-client-python && pytest
```

---

## 🐳 Testy Docker Mock Services (exef/)

ExEF posiada infrastrukturę Docker do testowania integracji z zewnętrznymi serwisami (storage, email) bez potrzeby prawdziwych kont.

### Storage Mock Services

Mockowane serwisy storage (Dropbox, Google Drive, OneDrive, Nextcloud):

```bash
# Uruchomienie mock services
make exef-test-storage-up

# Uruchomienie testów
make exef-test-storage

# Zatrzymanie mock services
make exef-test-storage-down

# Pełny cykl (up + test + down)
make exef-test-storage-full
```

**Porty mock services:**

| Serwis | Port | Endpoint |
|--------|------|----------|
| Dropbox | 8091 | `http://localhost:8091/health` |
| Google Drive | 8092 | `http://localhost:8092/health` |
| OneDrive | 8093 | `http://localhost:8093/health` |
| Nextcloud | 8094 | `http://localhost:8094/health` |

**Konfiguracja w `.env.test`:**

```bash
DROPBOX_API_URL=http://localhost:8091
GDRIVE_API_URL=http://localhost:8092
ONEDRIVE_API_URL=http://localhost:8093
NEXTCLOUD_WEBDAV_URL=http://localhost:8094/remote.php/dav/files/testuser/
```

Szczegóły: [`exef/docker/storage-tests/README.md`](../exef/docker/storage-tests/README.md)

### Email Mock Services

Mockowane serwisy email (Gmail API, Outlook API, GreenMail IMAP):

```bash
# Uruchomienie mock services
make exef-test-email-up

# Uruchomienie testów
make exef-test-email

# Zatrzymanie mock services
make exef-test-email-down

# Pełny cykl (up + test + down)
make exef-test-email-full
```

**Porty mock services:**

| Serwis | Port | Endpoint |
|--------|------|----------|
| Gmail Mock | 8081 | `http://localhost:8081/health` |
| Outlook Mock | 8082 | `http://localhost:8082/health` |
| GreenMail IMAP | 3143 | `imap://localhost:3143` |
| GreenMail SMTP | 3025 | `smtp://localhost:3025` |

### Device Mock Services (Scanners & Printers)

Mockowane urządzenia sieciowe (skanery i drukarki):

```bash
# Uruchomienie mock services
make exef-test-devices-up

# Uruchomienie testów
make exef-test-devices

# Zatrzymanie mock services
make exef-test-devices-down

# Pełny cykl (up + test + down)
make exef-test-devices-full
```

**Porty mock services:**

| Urządzenie | Port | Protokół | Endpoint |
|------------|------|----------|----------|
| Scanner 1 | 8101 | eSCL (AirScan) | `http://localhost:8101/health` |
| Scanner 2 | 8102 | eSCL (AirScan) | `http://localhost:8102/health` |
| Printer 1 | 8111 | IPP | `http://localhost:8111/health` |
| Printer 2 | 8112 | IPP | `http://localhost:8112/health` |

**Konfiguracja w `.env.test`:**

```bash
EXEF_SCANNER_1_ENABLED=true
EXEF_SCANNER_1_NAME=ExEF-Scanner-1
EXEF_SCANNER_1_API_URL=http://localhost:8101
EXEF_SCANNER_1_PROTOCOL=escl

EXEF_PRINTER_1_ENABLED=true
EXEF_PRINTER_1_NAME=ExEF-Printer-1
EXEF_PRINTER_1_API_URL=http://localhost:8111
EXEF_PRINTER_1_PROTOCOL=ipp
```

**Testowanie skanowania i drukowania:**

```bash
# Skanuj dokument (dodaje do inbox)
curl -X POST http://localhost:3030/devices/scanners/scanner-1-env/scan \
  -H "Content-Type: application/json" \
  -d '{"format":"pdf","resolution":300}'

# Drukuj fakturę
curl -X POST http://localhost:3030/inbox/invoices/{id}/print \
  -H "Content-Type: application/json" \
  -d '{"printerId":"printer-1-env","copies":1}'

# Status urządzeń
curl http://localhost:3030/devices
```

Szczegóły: [`exef/docker/device-tests/docker-compose.yml`](../exef/docker/device-tests/docker-compose.yml)

### Wszystkie Mock Services naraz

```bash
# Uruchom wszystkie mock services (storage + email + devices)
make exef-test-mocks-up

# Zatrzymaj wszystkie
make exef-test-mocks-down
```

### Testy z konfiguracją .env

Aby przetestować aplikację z mock services:

```bash
# 1. Skopiuj konfigurację testową
cp exef/.env.test exef/.env

# 2. Uruchom wszystkie mock services
make exef-test-mocks-up

# 3. Uruchom aplikację
make exef-local-dev

# 4. Sprawdź pobrane faktury
make exef-cli ARGS="inbox stats"

# 5. Sprawdź urządzenia
curl http://localhost:3030/devices
```

---

## KSeF: testy z prawdziwym środowiskiem demo/test

Do prawdziwego KSeF (demo/test) musisz pozyskać dane dostępowe po stronie KSeF (gov) – bez tego nie da się pobrać realnych faktur.

W tym repo są submodule/projekty, które opisują jak przejść pełny proces:

- `ksef/README.md`
  - skrypty `t-00-setup.py` (pobranie certyfikatów publicznych KSeF dla demo/test/prod)
  - sekwencja `t-03-auth-*` do uzyskania tokenów (challenge/sign/xades/redeem)
  - skrypty do tworzenia danych testowych i listowania/pobierania faktur

- `KSeF-Python-Client-Updated/README.md`
  - przykładowy CLI `scripts/ksef_tool.py` (init/login/refresh/invoice list/fetch/send)

W samym `exef/` konfigurujesz środowisko przez:

- `KSEF_ENV` = `demo` | `test` | `production`
- (opcjonalnie) `KSEF_BASE_URL`
- `EXEF_KSEF_NIP`, `EXEF_KSEF_TOKEN`, `EXEF_KSEF_TOKEN_TYPE`

Uwaga: tokeny/certyfikaty są wrażliwe. Nie commituj prawdziwych danych do repo.

### Wyniki testów

Po uruchomieniu `make exef-test-storage` lub `make exef-test-email`, wyniki zapisywane są w:

- `exef/docker/storage-tests/results/`
- `exef/docker/email-tests/results/`
