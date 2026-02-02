# EXEF Roadmap

## Wersjonowanie
Używamy [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`

---

## 🚀 v1.0.0 - MVP (Current)
**Status: ✅ Done**

### Core
- [x] Backend FastAPI (~230 LOC)
- [x] Frontend Alpine.js (~260 LOC)
- [x] SQLite storage
- [x] WebSocket real-time updates
- [x] Docker Compose setup

### Endpoints
- [x] Mock adapters (email, ksef, wfirma, printer)
- [x] Webhook receiver
- [x] Pull/Push flow API

### Tests
- [x] API tests (pytest)
- [x] UI tests (Playwright)
- [x] Integration tests

---

## 📋 v1.1.0 - Configuration & Profiles
**Status: 🔄 In Progress**
**ETA: 1-2 tygodnie**

### Tasks
- [ ] Konfiguracja przez zmienne środowiskowe
- [ ] Multi-profile support (wiele firm)
- [ ] Profile switching w UI
- [ ] Persystencja konfiguracji endpointów

### Files to change
```
backend/main.py      - Add profiles table, env config
backend/config.py    - NEW: configuration management
frontend/index.html  - Profile selector UI
```

---

## 📋 v1.2.0 - Real KSeF Integration
**Status: 📅 Planned**
**ETA: 2-3 tygodnie**

### Tasks
- [ ] KSeF API client (produkcja + demo)
- [ ] Certyfikat MCU management
- [ ] Pobieranie faktur zakupowych
- [ ] Wysyłanie faktur sprzedażowych
- [ ] Walidacja XML FA(2)

### Dependencies
- Certyfikat kwalifikowany lub MCU
- Dostęp do KSeF API (demo/prod)

### Files to add
```
backend/adapters/ksef.py     - KSeF API client
backend/adapters/ksef_xml.py - XML FA(2) generator
```

---

## 📋 v1.3.0 - Email IMAP Integration
**Status: 📅 Planned**
**ETA: 1 tydzień**

### Tasks
- [ ] IMAP client (SSL/TLS)
- [ ] Attachment extraction (PDF, images)
- [ ] OCR integration (Tesseract or API)
- [ ] Auto-categorization rules

### Files to add
```
backend/adapters/email.py    - IMAP client
backend/adapters/ocr.py      - OCR processing
```

---

## 📋 v1.4.0 - Export Adapters
**Status: 📅 Planned**
**ETA: 2 tygodnie**

### Tasks
- [ ] wFirma CSV export (KPiR format)
- [ ] Comarch Optima XML
- [ ] Symfonia export
- [ ] enova365 export
- [ ] JPK_PKPIR XML generation

### Files to add
```
backend/adapters/wfirma.py
backend/adapters/comarch.py
backend/adapters/symfonia.py
backend/adapters/enova.py
backend/adapters/jpk.py
```

---

## 📋 v1.5.0 - Document Processing
**Status: 📅 Planned**
**ETA: 2 tygodnie**

### Tasks
- [ ] PDF preview/viewer
- [ ] Document annotation
- [ ] Auto-description (AI-powered)
- [ ] Expense categorization (KPiR columns)
- [ ] R&D deduction tagging

### Files to add
```
backend/processing/categorizer.py
backend/processing/ai_describe.py
frontend/components/pdf-viewer.html
```

---

## 📋 v2.0.0 - Desktop App (Electron)
**Status: 📅 Future**
**ETA: 1-2 miesiące**

### Tasks
- [ ] Electron wrapper
- [ ] Offline-first architecture
- [ ] Local SQLite (no server needed)
- [ ] Auto-update mechanism
- [ ] System tray integration

### New structure
```
desktop/
├── main.js          - Electron main
├── preload.js       - IPC bridge
├── package.json
└── assets/
```

---

## 📋 v2.1.0 - Multi-user & Sharing
**Status: 📅 Future**

### Tasks
- [ ] User authentication (JWT)
- [ ] Role-based access (owner, accountant, viewer)
- [ ] Profile sharing invitations
- [ ] Audit log

---

## 📋 v2.2.0 - Integrations Hub
**Status: 📅 Future**

### Tasks
- [ ] Google Drive adapter
- [ ] Dropbox adapter
- [ ] OneDrive adapter
- [ ] Slack notifications
- [ ] Email notifications

---

## Development Workflow

### Branch Strategy
```
main          - stable releases
develop       - integration branch
feature/*     - new features
fix/*         - bug fixes
release/*     - release preparation
```

### Release Process
1. Create `release/vX.Y.Z` branch from `develop`
2. Update CHANGELOG.md
3. Update version in code
4. Run full test suite
5. Merge to `main` + tag
6. Merge back to `develop`

### PR Requirements
- [ ] Tests pass
- [ ] Code reviewed
- [ ] CHANGELOG updated
- [ ] Documentation updated

---

## Metrics & Goals

| Metric | Current | Target v2.0 |
|--------|---------|-------------|
| Total LOC | ~810 | <2000 |
| Test coverage | ~70% | >85% |
| Build time | ~2min | <1min |
| Startup time | ~1s | <500ms |

---

## Contributing

1. Pick task from roadmap
2. Create feature branch
3. Implement + tests
4. PR to `develop`
5. Code review
6. Merge

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.
