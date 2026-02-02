# EXEF Implementation Plan

## Current Status: v1.0.0 ✅

### Delivered
- ✅ Core document management (CRUD)
- ✅ Endpoint system (import/export)
- ✅ Status workflow (created → described → signed → exported)
- ✅ WebSocket real-time updates
- ✅ Docker Compose setup
- ✅ E2E tests (Playwright)
- ✅ Mock adapters

### Code Statistics
| Component | v1.0 LOC | v1.1 LOC |
|-----------|----------|----------|
| Backend (main.py) | 233 | 405 |
| Migrations | - | 245 |
| Config | - | 47 |
| Adapters | - | 1,069 |
| Frontend | 260 | 445 |
| Tests | 317 | 317 |
| **Total** | **~810** | **~2,500** |

---

## Sprint 1: v1.1.0 - Profiles (2 weeks)

### Week 1: Backend
| Day | Task | Files |
|-----|------|-------|
| 1 | Migrate to main_v1.1.py | `main.py` |
| 2 | Add migrations system | `migrations.py` |
| 3 | Profile CRUD API | `main.py` |
| 4 | Profile-scoped documents | `main.py` |
| 5 | Profile-scoped endpoints | `main.py` |

### Week 2: Frontend + Testing
| Day | Task | Files |
|-----|------|-------|
| 1-2 | Profile selector UI | `index.html` |
| 3 | Profile management view | `index.html` |
| 4 | Update tests | `test_e2e.py` |
| 5 | Integration testing | - |

### Acceptance Criteria
- [ ] Can create multiple profiles (companies)
- [ ] Can switch between profiles
- [ ] Documents/endpoints isolated per profile
- [ ] Backward compatible API (`/api/documents` → default profile)
- [ ] All tests pass

---

## Sprint 2: v1.2.0 - Real Integrations (3 weeks)

### Week 1: KSeF
| Day | Task | Files |
|-----|------|-------|
| 1 | KSeF API research | docs |
| 2-3 | KSeF adapter (pull) | `adapters/ksef.py` |
| 4-5 | KSeF adapter (push) | `adapters/ksef.py` |

### Week 2: Email
| Day | Task | Files |
|-----|------|-------|
| 1-2 | IMAP client | `adapters/email.py` |
| 3 | OAuth2 for Gmail | `adapters/email.py` |
| 4-5 | Attachment handling | `adapters/email.py` |

### Week 3: Testing & Polish
| Day | Task | Files |
|-----|------|-------|
| 1-2 | Integration tests | `test_e2e.py` |
| 3 | Error handling | all |
| 4 | Retry mechanism | `main.py` |
| 5 | Documentation | docs |

### Acceptance Criteria
- [ ] Can pull real invoices from KSeF (test env)
- [ ] Can push invoices to KSeF (test env)
- [ ] Can pull attachments from IMAP
- [ ] Retry on failures
- [ ] Credential encryption

---

## Sprint 3: v1.3.0 - OCR (2 weeks)

### Week 1: OCR Integration
| Day | Task | Files |
|-----|------|-------|
| 1 | OCR service selection | docs |
| 2-3 | Tesseract integration | `adapters/ocr.py` |
| 4-5 | Cloud OCR fallback | `adapters/ocr.py` |

### Week 2: Auto-categorization
| Day | Task | Files |
|-----|------|-------|
| 1-2 | Field extraction | `processing/` |
| 3-4 | Category suggestion | `processing/` |
| 5 | UI integration | `index.html` |

### Acceptance Criteria
- [ ] Extract NIP, amount, date from PDF/image
- [ ] Suggest category based on contractor history
- [ ] 80%+ accuracy on test set

---

## Sprint 4: v1.4.0 - KPiR Export (2 weeks)

### Week 1: Export Formats
| Day | Task | Files |
|-----|------|-------|
| 1 | wFirma CSV | `adapters/export.py` ✅ |
| 2 | Comarch Optima XML | `adapters/export.py` ✅ |
| 3 | Symfonia | `adapters/export.py` ✅ |
| 4 | enova365 | `adapters/export.py` ✅ |
| 5 | JPK_PKPIR | `adapters/export.py` ✅ |

### Week 2: Polish & Test
| Day | Task | Files |
|-----|------|-------|
| 1-2 | Remaining formats | `adapters/export.py` |
| 3 | R&D deductions | `adapters/export.py` |
| 4 | Automotive costs | `adapters/export.py` |
| 5 | Validation tests | `tests/` |

### Acceptance Criteria
- [ ] 11 export formats working
- [ ] R&D tax deduction support
- [ ] Automotive 50%/100% handling
- [ ] JPK validation passing

---

## Sprint 5: v1.5.0 - Desktop App (4 weeks)

### Week 1-2: Electron Setup
- [ ] Electron wrapper
- [ ] Local SQLite
- [ ] IPC communication
- [ ] Native menus

### Week 3: Offline Features
- [ ] Offline-first architecture
- [ ] Sync queue
- [ ] Conflict resolution

### Week 4: Polish
- [ ] Auto-updates
- [ ] System tray
- [ ] Native notifications
- [ ] Installer (Windows/macOS/Linux)

---

## Definition of Done

Each sprint must meet:
1. ✅ All acceptance criteria passed
2. ✅ Tests pass (>80% coverage)
3. ✅ Code reviewed
4. ✅ Documentation updated
5. ✅ CHANGELOG updated
6. ✅ Deployed to staging
7. ✅ QA sign-off

---

## Risk Management

| Risk | Impact | Mitigation |
|------|--------|------------|
| KSeF API changes | High | Monitor MF announcements, use versioned adapter |
| OAuth token expiry | Medium | Implement refresh flow, user notification |
| OCR accuracy | Medium | Fallback to manual, train on real data |
| DB corruption | High | Regular backups, transaction safety |

---

## Resources Needed

### Technical
- KSeF test certificates (MCU)
- Gmail API credentials
- OCR API key (optional)
- Code signing certificate (for desktop)

### Infrastructure
- CI/CD pipeline (GitHub Actions) ✅
- Staging environment
- Production environment
- Monitoring (Sentry/etc)

---

## Success Metrics

| Metric | v1.0 | v1.5 Target |
|--------|------|-------------|
| Document processing time | Manual | < 30s |
| Export generation | - | < 5s |
| Sync success rate | - | > 99% |
| User satisfaction | - | > 4.5/5 |

---

## Next Steps

1. **Today**: Review plan with team
2. **This week**: Start Sprint 1 (profiles)
3. **End of month**: v1.1.0 release
4. **Q1 2026**: v1.2.0 with real integrations
