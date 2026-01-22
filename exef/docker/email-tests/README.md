# ExeF Email Sync Tests

Testy integracyjne synchronizacji email z wykorzystaniem Docker i symulatorów API usług emailowych.

## Architektura

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    GreenMail    │     │  Gmail Mock API │     │ Outlook Mock API│
│   (IMAP/SMTP)   │     │   (OAuth2/REST) │     │  (Graph API)    │
│   Port: 3143    │     │   Port: 8081    │     │   Port: 8082    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │      Test Runner        │
                    │   (email-sync.test.js)  │
                    └─────────────────────────┘
```

## Usługi

### GreenMail (IMAP/SMTP)
- **Port 3143**: IMAP (plaintext)
- **Port 3993**: IMAPS (TLS)
- **Port 3025**: SMTP
- **Port 8080**: REST API (zarządzanie)

### Gmail Mock API
- **Port 8081**: Symulator Gmail API v1
- Obsługuje OAuth2 token refresh
- Symuluje listowanie wiadomości z załącznikami
- Pobieranie załączników

### Outlook Mock API
- **Port 8082**: Symulator Microsoft Graph API
- Obsługuje OAuth2 token refresh
- Symuluje Microsoft Graph `/me/messages` endpoint
- Pobieranie załączników

## Uruchomienie testów

### Szybki start

```bash
cd exef/docker/email-tests
./tests/run-tests.sh
```

### Ręczne uruchomienie

1. Uruchom usługi:
```bash
docker-compose up -d
```

2. Poczekaj na gotowość (health checks):
```bash
curl http://localhost:8081/health
curl http://localhost:8082/health
curl http://localhost:8080/api/user/list
```

3. Uruchom testy:
```bash
export GMAIL_API_URL=http://localhost:8081
export OUTLOOK_API_URL=http://localhost:8082
export IMAP_HOST=localhost
export IMAP_PORT=3143

node --test tests/email-sync.test.js
```

4. Zatrzymaj usługi:
```bash
docker-compose down
```

### Zachowanie usług po testach

```bash
./tests/run-tests.sh --keep
```

## Testowane scenariusze

### Gmail OAuth
- ✅ Autentykacja OAuth2 (refresh token → access token)
- ✅ Listowanie wiadomości z załącznikami
- ✅ Filtrowanie załączników typu faktura (PDF, JPG, PNG)
- ✅ Pobieranie zawartości załączników
- ✅ Obsługa wielu kont tego samego providera

### Outlook OAuth
- ✅ Autentykacja OAuth2 (Microsoft identity platform)
- ✅ Microsoft Graph API - listowanie wiadomości
- ✅ Filtrowanie `hasAttachments eq true`
- ✅ Pobieranie załączników przez Graph API
- ✅ Obsługa wielu kont Microsoft 365

### IMAP
- ✅ Połączenie z serwerem IMAP
- ✅ Konfiguracja TLS/SSL
- ✅ Obsługa wielu kont IMAP

### Cross-Provider
- ✅ Synchronizacja z wielu providerów jednocześnie
- ✅ Deduplikacja załączników po nazwie i rozmiarze

## API administracyjne (do testów)

### Gmail Mock
```bash
# Reset danych testowych
curl -X POST http://localhost:8081/admin/reset

# Lista wszystkich emaili
curl http://localhost:8081/admin/emails

# Dodaj testowy email
curl -X POST http://localhost:8081/admin/emails \
  -H "Content-Type: application/json" \
  -d '{"subject": "Test", "hasAttachments": true}'
```

### Outlook Mock
```bash
# Reset danych testowych
curl -X POST http://localhost:8082/admin/reset

# Lista wszystkich emaili
curl http://localhost:8082/admin/emails

# Dodaj testowy email
curl -X POST http://localhost:8082/admin/emails \
  -H "Content-Type: application/json" \
  -d '{"subject": "Test Invoice", "hasAttachments": true}'
```

## Struktura plików

```
docker/email-tests/
├── docker-compose.yml          # Konfiguracja Docker
├── Dockerfile.test-runner      # Kontener test runnera
├── README.md                   # Ta dokumentacja
├── mock-services/
│   ├── Dockerfile.gmail        # Gmail mock image
│   ├── Dockerfile.outlook      # Outlook mock image
│   ├── package.json            # Zależności mock services
│   ├── gmail-mock-server.js    # Symulator Gmail API
│   └── outlook-mock-server.js  # Symulator Outlook/Graph API
├── tests/
│   ├── email-sync.test.js      # Testy synchronizacji
│   └── run-tests.sh            # Skrypt uruchamiający
└── results/
    └── test-output.log         # Wyniki testów
```

## Dodawanie nowych providerów

1. Utwórz mock server w `mock-services/`
2. Dodaj Dockerfile dla nowego mock
3. Dodaj serwis do `docker-compose.yml`
4. Dodaj testy w `tests/email-sync.test.js`

## Troubleshooting

### Usługi nie startują
```bash
docker-compose logs
docker-compose ps
```

### Testy timeout
Sprawdź czy usługi są zdrowe:
```bash
docker-compose ps
curl http://localhost:8081/health
curl http://localhost:8082/health
```

### Port zajęty
```bash
docker-compose down
lsof -i :8081 -i :8082 -i :3143
```
