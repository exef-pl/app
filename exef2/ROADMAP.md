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
**Status: ✅ Done**

### Tasks
- [x] Konfiguracja przez zmienne środowiskowe
- [x] Multi-profile support (wiele firm)
- [x] Profile switching w UI
- [x] Persystencja konfiguracji endpointów

### Files changed
```
backend/main.py      - Profiles table, env config
backend/config.py    - Configuration management
frontend/index.html  - Profile selector UI
```

---

## 📋 v1.2.0 - Real KSeF Integration
**Status: ✅ Done**

### Tasks
- [x] KSeF API client (produkcja + demo)
- [x] Certyfikat MCU management
- [x] Pobieranie faktur zakupowych
- [x] Wysyłanie faktur sprzedażowych
- [x] Walidacja XML FA(2)

### Files added
```
backend/adapters/ksef.py     - KSeF API client + XML generator
```

---

## 📋 v1.3.0 - Email IMAP Integration
**Status: ✅ Done**

### Tasks
- [x] IMAP client (SSL/TLS)
- [x] Attachment extraction (PDF, images)
- [x] OCR integration (Tesseract, Google Vision, Azure)
- [x] Auto-categorization rules

### Files added
```
backend/adapters/email.py    - IMAP client
backend/adapters/ocr.py      - OCR processing (multi-provider)
backend/adapters/categorize.py - Auto-categorization
```

---

## 📋 v1.4.0 - Export Adapters
**Status: ✅ Done**

### Tasks
- [x] wFirma CSV export (KPiR format)
- [x] Comarch Optima XML
- [x] Symfonia export
- [x] enova365 export
- [x] JPK_PKPIR XML generation

### Files added
```
backend/adapters/export.py   - All export adapters in one file
```

---

## 📋 v1.5.0 - Document Processing
**Status: ✅ Done**

### Tasks
- [x] Auto-description (rule-based + history)
- [x] Expense categorization (30+ KPiR categories)
- [x] R&D deduction tagging
- [ ] PDF preview/viewer (frontend)
- [ ] Document annotation (frontend)

### Files added
```
backend/adapters/categorize.py - Categorization engine
backend/adapters/ocr.py        - OCR with invoice extraction
```

---

## 📋 v1.6.0 - URL Routing & Document Detail
**Status: ✅ Done**

### Tasks
- [x] URL-based navigation (view, profile params)
- [x] Browser back/forward support
- [x] Document detail view with URL params
- [x] Deep linking support
- [x] UI tests for URL routing

### Files changed
```
frontend/index.html  - navigate(), updateURL(), restoreFromURL()
tests/test_e2e.py    - TestURLRouting class
```

---

## 📋 v2.0.0 - Desktop App (Electron)
**Status: 🚧 In Progress**

### Tasks
- [x] Electron wrapper
- [x] Polish menu & shortcuts
- [x] Offline mode UI
- [ ] Local SQLite integration
- [ ] Auto-sync when online
- [ ] Auto-update mechanism
- [ ] System tray integration

### New structure
```
desktop/
├── main.js          - Electron main process
├── preload.js       - IPC bridge (contextBridge)
├── renderer/        - Offline UI
├── assets/          - Icons
├── package.json     - Electron dependencies
└── README.md
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
