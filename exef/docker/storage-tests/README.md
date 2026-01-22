# ExeF Storage Sync Tests

Testy integracyjne synchronizacji storage z wykorzystaniem Docker i symulatorów API dla Dropbox, Google Drive, OneDrive i Nextcloud.

## Architektura

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Dropbox Mock   │  │  GDrive Mock    │  │  OneDrive Mock  │  │ Nextcloud Mock  │
│   Port: 8091    │  │   Port: 8092    │  │   Port: 8093    │  │   Port: 8094    │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │                    │
         └────────────────────┼────────────────────┼────────────────────┘
                              │                    │
                    ┌─────────┴────────────────────┴─────────┐
                    │            Test Runner                  │
                    │      (storage-sync.test.js)            │
                    └─────────────────────────────────────────┘
```

## Usługi

### Dropbox Mock API (port 8091)

- OAuth2 token refresh
- `POST /2/files/list_folder` - listowanie plików
- `POST /2/files/list_folder/continue` - paginacja
- `POST /2/files/download` - pobieranie plików

### Google Drive Mock API (port 8092)

- OAuth2 token refresh
- `GET /drive/v3/files` - listowanie z filtrowaniem
- `GET /drive/v3/files/:id` - metadata pliku
- `GET /drive/v3/files/:id?alt=media` - pobieranie

### OneDrive Mock API (port 8093)

- OAuth2 token refresh (Microsoft identity platform)
- `GET /v1.0/me/drive/root/delta` - delta query
- `GET /v1.0/me/drive/items/:id/content` - pobieranie
- Obsługa shared drives

### Nextcloud Mock API (port 8094)

- Basic auth
- WebDAV PROPFIND - listowanie plików
- WebDAV GET - pobieranie plików
- Obsługa wielu użytkowników

## Uruchomienie testów

### Szybki start

```bash
cd exef/docker/storage-tests
chmod +x tests/run-tests.sh
./tests/run-tests.sh
```

### Ręczne uruchomienie

```bash
# 1. Uruchom usługi
docker-compose up -d

# 2. Sprawdź health
curl http://localhost:8091/health  # Dropbox
curl http://localhost:8092/health  # GDrive
curl http://localhost:8093/health  # OneDrive
curl http://localhost:8094/health  # Nextcloud

# 3. Uruchom testy
export DROPBOX_API_URL=http://localhost:8091
export GDRIVE_API_URL=http://localhost:8092
export ONEDRIVE_API_URL=http://localhost:8093
export NEXTCLOUD_API_URL=http://localhost:8094

node --test tests/storage-sync.test.js

# 4. Zatrzymaj usługi
docker-compose down
```

### Zachowanie usług

```bash
./tests/run-tests.sh --keep
```

## Testowane scenariusze

### Dropbox

- ✅ OAuth2 token refresh
- ✅ Listowanie plików rekurencyjnie
- ✅ Cursor-based pagination
- ✅ Pobieranie plików (PDF, XML, obrazy)
- ✅ Wiele kont Dropbox

### Google Drive

- ✅ OAuth2 token refresh
- ✅ Listowanie plików w folderze
- ✅ Filtrowanie po modifiedTime
- ✅ Pobieranie plików
- ✅ Wiele kont Google

### OneDrive

- ✅ OAuth2 token refresh (Microsoft)
- ✅ Delta query API
- ✅ Obsługa deltaLink dla incremental sync
- ✅ Pobieranie plików
- ✅ Wiele kont Microsoft

### Nextcloud

- ✅ Basic authentication
- ✅ WebDAV PROPFIND
- ✅ Parsowanie XML response
- ✅ Pobieranie plików
- ✅ Wiele użytkowników

### Cross-Provider

- ✅ Synchronizacja z wszystkich providerów
- ✅ Deduplikacja po nazwie i rozmiarze
- ✅ Priorytetyzacja providerów

## API administracyjne

### Dropbox Mock

```bash
curl http://localhost:8091/admin/files
curl -X POST http://localhost:8091/admin/reset
curl -X POST http://localhost:8091/admin/files \
  -H "Content-Type: application/json" \
  -d '{"name":"test.pdf","path_display":"/test.pdf"}'
```

### Google Drive Mock

```bash
curl http://localhost:8092/admin/files
curl http://localhost:8092/admin/folders
curl -X POST http://localhost:8092/admin/reset
```

### OneDrive Mock

```bash
curl http://localhost:8093/admin/files
curl -X POST http://localhost:8093/admin/reset
```

### Nextcloud Mock

```bash
curl http://localhost:8094/admin/files
curl -X POST http://localhost:8094/admin/reset
curl -X POST http://localhost:8094/admin/users \
  -H "Content-Type: application/json" \
  -d '{"username":"newuser","password":"pass123"}'
```

## Struktura plików

```
docker/storage-tests/
├── docker-compose.yml
├── Dockerfile.test-runner
├── README.md
├── mock-services/
│   ├── package.json
│   ├── Dockerfile.dropbox
│   ├── Dockerfile.gdrive
│   ├── Dockerfile.onedrive
│   ├── Dockerfile.nextcloud
│   ├── dropbox-mock-server.js
│   ├── gdrive-mock-server.js
│   ├── onedrive-mock-server.js
│   └── nextcloud-mock-server.js
├── tests/
│   ├── storage-sync.test.js
│   └── run-tests.sh
└── results/
    └── test-output.log
```

## Troubleshooting

### Usługi nie startują

```bash
docker-compose logs
docker-compose ps
```

### Testy timeout

```bash
# Sprawdź health
for port in 8091 8092 8093 8094; do
  curl -s http://localhost:$port/health && echo " - port $port OK"
done
```

### Port zajęty

```bash
docker-compose down
lsof -i :8091 -i :8092 -i :8093 -i :8094
```
