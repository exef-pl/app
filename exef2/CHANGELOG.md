## [2.0.1] - 2026-02-02

### Summary

feat(exef2): deep code analysis engine with 4 supporting modules

### Other

- update exef2/frontend/index.html
- update exef2/project.functions.toon
- scripts: update project.sh
- update exef2/project.toon-schema.json


## [1.0.4] - 2026-02-02

### Summary

feat(tests): deep code analysis engine with 3 supporting modules

### Other

- update exef2/backend/main.py
- update exef2/frontend/index.html
- update exef2/tests/test_e2e.py


## [1.0.3] - 2026-02-02

### Summary

feat(docs): deep code analysis engine with 6 supporting modules

### Docs

- docs: update ROADMAP.md

### Other

- docker: update Dockerfile
- update exef2/backend/adapters/__init__.py
- update exef2/backend/adapters/categorize.py
- update exef2/backend/adapters/ocr.py
- update exef2/backend/main.py
- update exef2/frontend/index.html
- update exef2/tests/test_e2e.py
- update project.functions.toon
- update project.toon


## [1.0.2] - 2026-02-02

### Summary

refactor(tests): deep code analysis engine with 4 supporting modules

### Other

- update exef2/backend/main.py
- update exef2/backend/main_v1.1.py
- update exef2/frontend/index.html
- docker: update Dockerfile
- update exef2/tests/test_e2e.py
- update project.functions.toon
- update project.toon


## [1.0.1] - 2026-02-02

### Summary

feat(docs): deep code analysis engine with 6 supporting modules

### Docs

- docs: update DEPLOYMENT.md
- docs: update IMPLEMENTATION_PLAN.md
- docs: update README
- docs: update ROADMAP.md

### Config

- config: update goal.yaml

### Other

- update exef2/.env.example
- config: update ci.yml
- build: update Makefile
- docker: update Dockerfile
- update exef2/backend/adapters/__init__.py
- update exef2/backend/adapters/email.py
- update exef2/backend/adapters/export.py
- update exef2/backend/adapters/ksef.py
- update exef2/backend/config.py
- update exef2/backend/main_v1.1.py
- ... and 4 more


# Changelog

All notable changes to EXEF will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Multi-profile support
- Environment configuration
- Profile switching in UI

---

## [1.0.0] - 2026-02-02

### Added
- Initial release
- FastAPI backend with SQLite storage
- Alpine.js frontend (single HTML file)
- WebSocket real-time updates
- Document CRUD operations
- Endpoint management (import/export)
- Flow API (pull/push)
- Mock adapters: email, ksef, wfirma, scanner, printer, webhook
- Webhook receiver for external systems
- Docker Compose setup
- E2E tests with Playwright
- API tests with pytest

### Architecture
- Backend: ~230 lines of Python
- Frontend: ~260 lines of HTML/JS
- Tests: ~320 lines
- Total: ~810 lines

### Endpoints supported
| Type | Direction | Implementation |
|------|-----------|----------------|
| email | import | mock |
| ksef | import/export | mock |
| scanner | import | mock |
| webhook | import/export | real |
| wfirma | export | mock |
| printer | export | mock |

---

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| 1.0.0 | 2026-02-02 | Initial MVP release |

---

## Migration Guides

### From 0.x to 1.0.0
N/A - Initial release

---

## Deprecations

None yet.
