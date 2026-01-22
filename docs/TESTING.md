# Testowanie

Ten monorepo-agregator zawiera różne projekty (submoduły) oraz nowy projekt `exef/`. Poniżej są zasady testowania.

## Testy (Python SDK: `ksef-client-python`)

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

## Testy E2E (agregator / `exef/`)

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

### Desktop E2E

Test desktop jest smoke-testem i może wymagać:

- zainstalowanych zależności Node w `exef/` (`npm --prefix exef install`),
- środowiska z GUI (np. `DISPLAY` na Linux) — w przeciwnym razie test zostanie pominięty.
