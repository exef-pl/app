# exef-pl/app

To repozytorium jest agregatorem projektów związanych z KSeF (Krajowy System e-Faktur):

- trzymamy listę referencyjnych implementacji w `REPO.md` i pobieramy je jako submoduły Git,
- generujemy zunifikowane indeksy (Toon) dla każdego projektu, żeby dało się je porównywać i analizować,
- na bazie tych indeksów budujemy nowy projekt `exef/` (JavaScript + Docker), który docelowo generuje 3 artefakty:
  - web service (Docker) pod VPS/produkcję,
  - local service (binarka) dla Linux/Windows,
  - desktop app (binarka) dla Linux/Windows.

## Licencja

Ten projekt jest na licencji Apache-2.0 (`LICENSE`).

## Submoduły (repozytoria źródłowe)

Lista repo jest w `REPO.md`.

- Pobranie / inicjalizacja submodułów:

  ```bash
  make submodules
  ```

- Aktualizacja submodułów do najnowszych commitów:

  ```bash
  make update-submodules
  ```

## Indeksy (code2logic / pyhrton)

Indeksy generujemy narzędziem `code2logic` (z paczki `pyhrton`) w formacie Toon.

Wymaganie: komenda `code2logic` musi być dostępna w `PATH`.

Generowanie indeksów dla każdego submodułu (oddzielnie), z outputem do katalogu głównego `./`:

```bash
make indexes
```

Efekt:

- `./<project>.functions.toon`
- `./<project>.toon-schema.json`

Dodatkowo:

```bash
make analyze-all
```

tworzy raport `analysis_report.md` na podstawie wygenerowanych indeksów.

## Nowy projekt: `exef/` (Docker + JavaScript)

Katalog `exef/` zawiera projekt, który generuje 3 artefakty:
- web service (Docker) pod VPS/produkcję,
- local service (binarka) dla Linux/Windows,
- desktop app (binarka) dla Linux/Windows.

### Konfiguracja (`.env`)

Wszystkie artefakty czytają zmienne z pliku `.env` (lub wskazanego przez `EXEF_ENV_FILE`). Przykładowy plik to `.env.example`.

Ważne zmienne:
- `KSEF_ENV` (`test|demo|production`) i `KSEF_BASE_URL`
- `EXEF_WEB_HOST`, `EXEF_WEB_INTERNAL_PORT`, `EXEF_WEB_PORT_MAPPING` (docker)
- `EXEF_LOCAL_SERVICE_HOST`, `EXEF_LOCAL_SERVICE_PORT`, `EXEF_LOCAL_SERVICE_PORT_FILE`
- `EXEF_DESKTOP_LOCAL_SERVICE_BASE_URL` (opcjonalny override)

Automatyczna zmiana portu przy konflikcie:
- **local-service**: jeśli preferowany port zajęty, wybiera kolejny wolny (lub losowy) i zapisuje go do `EXEF_LOCAL_SERVICE_PORT_FILE`.
- **desktop**: czyta faktyczny port z `EXEF_LOCAL_SERVICE_PORT_FILE`, więc działa nawet przy konflikcie.
- **web**: w Dockerze używa `make exef-web-up` do dobrania wolnego host-portu.

### 1) Web service (Docker / VPS)

Budowanie i uruchomienie z auto-portem:

```bash
make exef-web-up
```

Ręcznie przez Docker Compose:

```bash
docker compose -f exef/docker-compose.yml up --build
```

- Domyślnie: `http://localhost:3000/health`

### 2) Local service (binarka: Linux/Windows)

Uruchomienie developerskie:

```bash
cd exef
npm install
npm run local
```

Build binarki (pkg):

```bash
cd exef
npm run build:local:bin
```

Paczki Linux (deb/rpm) przez nfpm:

```bash
make exef-local-packages
```

### 3) Desktop app (binarka: Linux/Windows)

Uruchomienie developerskie:

```bash
cd exef
npm install
npm run desktop
```

Build instalatorów/paczek (electron-builder):

```bash
cd exef
npm run build:desktop
# lub z głównego katalogu:
make exef-desktop-build
```

Smoke-test na Linux (start local-service, weryfikacja health, uruchomienie AppImage):

```bash
make exef-desktop-test
```

### 4) Wszystkie artefakty naraz

```bash
make exef-all
```

## Release / tagowanie (make push)

W tym repo tagowanie i wersjonowanie jest zautomatyzowane.

Zasada:

- robisz zmiany i commitujesz,
- uruchamiasz `make push`.

`make push`:

- podbija wersję (plik `VERSION`),
- generuje wpisy release w `docs/v/<tag>/`:
  - `docs/v/<tag>/changelog.md`
  - `docs/v/<tag>/todo.md`
- tworzy commit release,
- tworzy tag `vX.Y.Z`,
- wykonuje `git push --follow-tags`.

Typ bumpu możesz ustawić przez `BUMP`:

```bash
BUMP=patch make push
BUMP=minor make push
BUMP=major make push
```

## Testowanie

Szczegóły są w `docs/TESTING.md`.

## 🤝 Kontrybucja

Zasady kontrybucji są w `docs/CONTRIBUTING.md`.

