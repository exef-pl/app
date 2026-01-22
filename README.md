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

Katalog `exef/` zawiera zalążek projektu, który docelowo ma być budowany w oparciu o wspólny model funkcji/kontraktów wyprowadzony z indeksów `.functions.toon`.

### 1) Web service (Docker / VPS)

Uruchomienie przez Docker Compose:

```bash
docker compose -f exef/docker-compose.yml up --build
```

- Domyślnie: `http://localhost:3000/health`

### 2) Local service (binarka: Linux/Windows)

Uruchomienie developerskie:

```bash
npm install
npm run local
```

Build binarki (obecnie przez `pkg`):

```bash
npm run build:local:bin
```

### 3) Desktop app (binarka: Linux/Windows)

Uruchomienie:

```bash
npm install
npm run desktop
```

Build instalatorów/paczek:

```bash
npm run build:desktop
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

