# EXEF: Architektura Obiegu Faktur

**Status projektu:** W fazie projektowania  
**Data:** 2026-01-22

## Problem

Przedsiębiorca otrzymuje faktury z wielu źródeł jednocześnie:
- **Email** - załączniki PDF/JPG
- **Skaner** - dokumenty papierowe
- **Storage** - pliki z Dropbox/Google Drive/lokalnie
- **KSeF** - e-faktury w formacie XML (obowiązkowo od 02.2026)

Każde źródło wymaga innego podejścia do przetwarzania, ale końcowy efekt jest taki sam: opisana faktura gotowa do księgowania.

## Proponowana Architektura

```
┌─────────────────────────────────────────────────────────────────────┐
│                        EXEF Desktop/Web                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │  Email   │  │  Scanner │  │  Storage │  │   KSeF   │            │
│  │  Watcher │  │  Import  │  │   Sync   │  │  Facade  │            │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘            │
│       │             │             │             │                    │
│       ▼             ▼             ▼             ▼                    │
│  ┌─────────────────────────────────────────────────────┐            │
│  │              Unified Invoice Inbox                   │            │
│  │  (kolejka faktur do opisania - wszystkie źródła)    │            │
│  └──────────────────────┬──────────────────────────────┘            │
│                         │                                            │
│                         ▼                                            │
│  ┌─────────────────────────────────────────────────────┐            │
│  │              OCR / Parser Pipeline                   │            │
│  │  - PDF/JPG → OCR → strukturyzowane dane             │            │
│  │  - KSeF XML → parser → strukturyzowane dane         │            │
│  └──────────────────────┬──────────────────────────────┘            │
│                         │                                            │
│                         ▼                                            │
│  ┌─────────────────────────────────────────────────────┐            │
│  │              Auto-Description Engine                 │            │
│  │  - wzorce kontrahentów (historia)                   │            │
│  │  - reguły MPK / kategorii kosztów                   │            │
│  │  - sugestie AI (opcjonalnie)                        │            │
│  └──────────────────────┬──────────────────────────────┘            │
│                         │                                            │
│                         ▼                                            │
│  ┌─────────────────────────────────────────────────────┐            │
│  │              Draft Invoice Store                     │            │
│  │  status: draft → described → approved → booked      │            │
│  └──────────────────────┬──────────────────────────────┘            │
│                         │                                            │
│                         ▼                                            │
│  ┌─────────────────────────────────────────────────────┐            │
│  │              Export / Sync                           │            │
│  │  - Link do księgowego (wFirma API)                  │            │
│  │  - CSV/Excel export                                 │            │
│  │  - Webhook powiadomienia                            │            │
│  └─────────────────────────────────────────────────────┘            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Nowe Moduły do Implementacji

### 1. Email Watcher (`src/core/emailWatcher.js`)

```javascript
// Koncept - monitoring IMAP/OAuth
const emailWatcher = {
  sources: ['imap', 'gmail-oauth', 'outlook-oauth'],
  pollInterval: 300000, // 5 min
  
  async checkForInvoices() {
    // 1. Połącz ze skrzynką
    // 2. Szukaj załączników PDF/JPG
    // 3. Dodaj do Unified Inbox
  }
}
```

### 2. Storage Sync (`src/core/storageSync.js`)

```javascript
// Koncept - sync z chmurą/lokalnie
const storageSync = {
  providers: ['dropbox', 'gdrive', 'local-folder'],
  watchPaths: ['/Faktury', '/Do opisania'],
  
  async syncNewFiles() {
    // 1. Wykryj nowe pliki
    // 2. Dodaj do Unified Inbox
  }
}
```

### 3. Unified Inbox (`src/core/unifiedInbox.js`)

```javascript
// Centralny punkt dla wszystkich faktur
class UnifiedInbox {
  async addInvoice(source, file, metadata) {
    return {
      id: uuid(),
      source: source,        // 'email' | 'scanner' | 'storage' | 'ksef'
      status: 'pending',     // pending → ocr → described → approved
      originalFile: file,
      ksefId: metadata?.ksefId || null,
      createdAt: new Date()
    }
  }
}
```

### 4. OCR Pipeline (`src/core/ocrPipeline.js`)

```javascript
// Przetwarzanie nieustrukturyzowanych źródeł
class OcrPipeline {
  async process(invoice) {
    if (invoice.source === 'ksef') {
      return this.parseKsefXml(invoice);  // już strukturyzowane
    }
    
    // OCR dla PDF/JPG
    const ocrResult = await this.runOcr(invoice.originalFile);
    return this.extractInvoiceData(ocrResult);
  }
}
```

### 5. Auto-Description Engine (`src/core/autoDescribe.js`)

```javascript
// Automatyczne opisy na podstawie historii
class AutoDescribeEngine {
  async suggest(invoiceData) {
    // 1. Szukaj kontrahenta w historii
    const history = await this.findContractorHistory(invoiceData.nip);
    
    // 2. Zaproponuj kategorię/MPK
    const suggestion = this.matchPattern(invoiceData, history);
    
    return {
      category: suggestion.category,     // np. 'paliwo', 'marketing'
      mpk: suggestion.mpk,               // miejsce powstawania kosztu
      confidence: suggestion.score,      // 0-100%
      basedOn: history.length            // ile poprzednich faktur
    }
  }
}
```

## Integracja z Istniejącym Kodem

Twój obecny `ksefFacade.js` obsługuje:
- ✅ Autoryzacja tokenem KSeF
- ✅ Otwieranie/zamykanie sesji
- ✅ Wysyłanie faktur
- ✅ Pobieranie faktur
- ✅ Status faktur

**Do dodania w ksefFacade:**
```javascript
// Rozszerzenie - automatyczne pobieranie nowych faktur
async pollNewInvoices(since) {
  const metadata = await this.queryInvoiceMetadata({
    dateFrom: since,
    subjectType: 'subject2'  // faktury zakupowe
  });
  
  return metadata.invoices.map(inv => ({
    source: 'ksef',
    ksefId: inv.ksefReferenceNumber,
    // ... przekaż do UnifiedInbox
  }));
}
```

## Przepływ Użytkownika (UI)

```
┌─────────────────────────────────────────────────────────────────┐
│  EXEF - Faktury do opisania                            [3 nowe] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📧 Email    📷 Skaner    📁 Storage    🔐 KSeF                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🟡 FV/2026/01/001 - ABC Sp. z o.o.        [z KSeF]      │   │
│  │    1,230.00 PLN | Sugestia: Hosting (95%)               │   │
│  │    [Zatwierdź] [Edytuj] [Odrzuć]                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🟡 scan_20260122.pdf - ???                [ze skanera]  │   │
│  │    OCR: 456.78 PLN | NIP: 1234567890                    │   │
│  │    [Opisz ręcznie] [Dopasuj kontrahenta]                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🟢 FV/2026/01/099 - XYZ S.A.              [z email]     │   │
│  │    890.00 PLN | Kategoria: Marketing                    │   │
│  │    [✓ Zatwierdzone] → wysłane do księgowego             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Porównanie z Konkurencją

| Funkcja | wFirma | Symfonia | enova365 | **EXEF** |
|---------|--------|----------|----------|----------|
| Email monitoring | IMAP | OAuth | Workflow | **Wszystkie** |
| Scanner mobile | Tak | Drag&drop | Moduł | **Planowane** |
| Storage sync | Dropbox | Drive | DMS | **Multi-provider** |
| KSeF | Pełna | Plus API | DMS | **✅ Gotowe** |
| Auto-opis | Historia | MPK wzorce | Workflow | **AI + reguły** |
| Eksport do biura | Role | Link/Excel | Workflow | **API + link** |

## Następne Kroki

1. **Sprint 1 (tydzień 1-2):** Unified Inbox + podstawowy UI
2. **Sprint 2 (tydzień 3-4):** OCR Pipeline (integracja z Tesseract/zewnętrznym API)
3. **Sprint 3 (tydzień 5-6):** Email Watcher + Storage Sync
4. **Sprint 4 (tydzień 7-8):** Auto-Description Engine
5. **Sprint 5 (tydzień 9-10):** Eksport do biura rachunkowego

## Decyzje Architektoniczne do Podjęcia

1. **OCR:** Własny (Tesseract) vs API (Comarch 91%, Google Vision)?
2. **Storage:** Który provider priorytetowo (Dropbox/GDrive/oba)?
3. **Email:** IMAP polling vs OAuth webhooks?
4. **Baza danych:** SQLite (desktop) vs PostgreSQL (web)?
5. **Eksport:** Tylko wFirma czy uniwersalny CSV?

---

*Artykuł wygenerowany dla projektu EXEF - Softreck Organization*
