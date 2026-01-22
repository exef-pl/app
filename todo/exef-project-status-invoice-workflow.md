# EXEF: Status Projektu - Obieg Faktur Multi-Source

**Projekt:** EXEF  
**Data:** 2026-01-22  
**Status:** W fazie projektowania architektury  
**Następny milestone:** Sprint 1 - Unified Inbox + UI

---

## Cel Projektu

EXEF to aplikacja księgowa (desktop + web) umożliwiająca **opisywanie faktur** z wielu źródeł jednocześnie:

- 📧 **Email** - automatyczne pobieranie załączników
- 📷 **Skaner** - import dokumentów papierowych  
- 📁 **Storage** - synchronizacja z Dropbox/Google Drive
- 🔐 **KSeF** - e-faktury z Krajowego Systemu (obowiązkowo od 02.2026)

## Analiza Konkurencji

Zbadaliśmy rozwiązania dostępne na polskim rynku:

| Funkcja | wFirma | Symfonia | enova365 | **EXEF** |
|---------|--------|----------|----------|----------|
| Email monitoring | IMAP | OAuth | Workflow | **Wszystkie** |
| OCR | Wbudowany | 91% | Moduł | **Tesseract/API** |
| KSeF | Pełna | Plus API | DMS | **✅ Gotowe** |
| Auto-opis | Historia | MPK wzorce | Workflow | **AI + reguły** |

Szczegóły w dokumentach projektu: `opsiywanie`, `ksef`, `OCR`, `hook`.

## Architektura

```
┌─────────────────────────────────────────────────────────────┐
│  Email Watcher │ Storage Sync │ Scanner │ KSeF Facade       │
└────────────────┴──────────────┴─────────┴───────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Unified Invoice Inbox                     │
│              (wszystkie faktury w jednym miejscu)           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      OCR Pipeline                            │
│              (PDF/JPG → strukturyzowane dane)               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 Auto-Description Engine                      │
│           (sugestie kategorii na podstawie historii)        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Export / Sync                             │
│              (CSV, wFirma API, powiadomienia)               │
└─────────────────────────────────────────────────────────────┘
```

## Nowe Moduły

Zaprojektowano 5 nowych modułów do implementacji:

1. **unifiedInbox.js** - centralny punkt zbierania faktur
2. **emailWatcher.js** - monitoring IMAP/OAuth
3. **storageSync.js** - sync z chmurą i lokalnie
4. **autoDescribe.js** - automatyczne sugestie kategorii
5. **orchestrator.js** - łączy wszystko w pipeline

Istniejący **ksefFacade.js** zostanie rozszerzony o automatyczne pobieranie.

## Timeline

| Sprint | Tydzień | Zakres |
|--------|---------|--------|
| 1 | 1-2 | Unified Inbox + podstawowy UI |
| 2 | 3-4 | OCR Pipeline (Tesseract) |
| 3 | 5-6 | Email Watcher + Storage Sync |
| 4 | 7-8 | Auto-Description Engine |
| 5 | 9-10 | Eksport do biura rachunkowego |

## Decyzje do Podjęcia

- [ ] OCR: Tesseract (lokalny) vs Google Vision (API)?
- [ ] Storage: Dropbox first czy Google Drive?
- [ ] Email: IMAP polling vs OAuth webhooks?
- [ ] Baza: SQLite (desktop) vs PostgreSQL (web)?
- [ ] Eksport: Tylko wFirma czy uniwersalny?

## Następne Kroki

1. Zatwierdzenie architektury z Gregory
2. Setup repozytorium dla nowych modułów
3. Start Sprint 1: Unified Inbox

---

*Softreck Organization / EXEF Project*
