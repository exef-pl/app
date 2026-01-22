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

### Testy z konfiguracją .env

Aby przetestować aplikację z mock services:

```bash
# 1. Skopiuj konfigurację testową
cp exef/.env.test exef/.env

# 2. Uruchom mock services
make exef-test-storage-up
make exef-test-email-up

# 3. Uruchom aplikację
make exef-local-dev

# 4. Sprawdź pobrane faktury
make exef-cli ARGS="inbox stats"
```

### Wyniki testów

Po uruchomieniu `make exef-test-storage` lub `make exef-test-email`, wyniki zapisywane są w:

- `exef/docker/storage-tests/results/`
- `exef/docker/email-tests/results/`
