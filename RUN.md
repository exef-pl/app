# Jak uruchomić wersję deweloperską z danymi testowymi z pliku `.env`. 

Aby uruchomić wersję deweloperską z danymi testowymi z [.env.test](cci:7://file:///home/tom/github/exef-pl/app/exef/.env.test:0:0-0:0), użyj jednej z tych komend:

**Dla lokalnego serwisu (backend UI):**
```bash
cd exef && NODE_ENV=test EXEF_ENV_FILE=.env.test node src/local-service/server.js
```

**Dla aplikacji desktopowej:**
```bash
cd exef && NODE_ENV=test EXEF_ENV_FILE=.env.test npm run desktop
```

**Dla web interfejsu:**
```bash
cd exef && NODE_ENV=test EXEF_ENV_FILE=.env.test npm run web
```

**Dla CLI:**
```bash
cd exef && NODE_ENV=test EXEF_ENV_FILE=.env.test npm run cli
```

Plik [.env.test](cci:7://file:///home/tom/github/exef-pl/app/exef/.env.test:0:0-0:0) zawiera konfigurację mock services dla testów, w tym:
- Mock OCR, storage (Dropbox, GDrive, OneDrive, Nextcloud)
- Mock email providers (Gmail, Outlook, IMAP)
- Testowe dane KSeF
- Mock skanery i drukarki

Chcesz uruchomić którąś z tych opcji?