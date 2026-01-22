# EXEF: Eksport KPiR 2026 - Status Funkcjonalności

**Projekt:** EXEF (opisz.pl)  
**Data:** 2026-01-22  
**Status:** W implementacji  
**Priorytet:** Wysoki (KSeF obowiązkowy od 02.2026)

---

## Cel

Umożliwienie eksportu opisanych faktur do formatu **KPiR 2026** zgodnego z:
- Nowym rozporządzeniem MFiG z 6.09.2025 (19 kolumn)
- Popularnymi aplikacjami księgowymi w Polsce
- Formatem JPK_PKPIR (wymagany od 2026)

## Nowy Wzór KPiR 2026

Od 1 stycznia 2026 obowiązuje nowy wzór KPiR z **19 kolumnami** (było 17):

| Kol. | Nazwa | Opis | NOWA? |
|------|-------|------|-------|
| 1 | Lp | Liczba porządkowa | |
| 2 | Data | Data zdarzenia | |
| **3** | **Nr KSeF** | **Numer faktury w KSeF** | **✓** |
| 4 | Nr dowodu | Inny numer dokumentu | |
| **5** | **NIP** | **NIP kontrahenta** | **✓** |
| 6 | Nazwa | Nazwa kontrahenta | |
| 7 | Adres | Adres kontrahenta | |
| 8 | Opis | Opis zdarzenia | |
| 9-11 | Przychody | Sprzedaż + pozostałe + razem | |
| 12 | Zakup towarów | Towary handlowe i materiały | |
| 13 | Koszty uboczne | Transport, cło | |
| 14 | Wynagrodzenia | Pensje + ZUS pracodawcy | |
| 15 | Pozostałe | Większość kosztów firmowych | |
| 16 | Razem wydatki | Suma 12-15 | |
| 17 | Wydatki przyszłe | RMK | |
| **18** | **Koszty B+R** | **Ulga na badania i rozwój** | |
| 19 | Uwagi | Notatki (np. dotacje) | |

## Obsługiwane Formaty Eksportu

### Uniwersalne (10 aplikacji)

| Format | Rozszerzenie | Aplikacje | Status |
|--------|--------------|-----------|--------|
| KPiR CSV | .csv | Excel, LibreOffice, Google Sheets | ✅ |
| KPiR Excel | .xlsx | Excel (z formułami) | ✅ |
| JPK_PKPIR | .xml | e-Deklaracje, Urząd Skarbowy | ✅ |

### Dedykowane

| Format | Rozszerzenie | Aplikacja | Status |
|--------|--------------|-----------|--------|
| wFirma | .csv | wFirma.pl | ✅ |
| Comarch Optima | .xml | Comarch ERP Optima | ✅ |
| Insert Subiekt | .epp | Subiekt GT/nexo | ✅ |
| Symfonia | .csv | Symfonia Handel/FK | ✅ |
| enova365 | .xml | enova365 | ✅ |
| inFakt | .csv | inFakt.pl | ✅ |
| iFirma | .csv | iFirma.pl | ✅ |
| Fakturownia | .csv | Fakturownia.pl | ✅ |

## Kategorie Kosztów z Mapowaniem

### Kolumna 12 - Zakup towarów
- `towary` - Zakup towarów handlowych
- `materialy` - Zakup materiałów

### Kolumna 13 - Koszty uboczne
- `transport` - Koszty transportu
- `clo` - Cło i opłaty celne

### Kolumna 14 - Wynagrodzenia
- `wynagrodzenia` - Pensje
- `zus` - Składki ZUS pracodawcy

### Kolumna 15 - Pozostałe wydatki

**Samochód (tag: auto):**
- `paliwo` - Paliwo
- `auto_eksploatacja` - Eksploatacja
- `auto_ubezpieczenie` - Ubezpieczenie (OC/AC)
- `auto_serwis` - Serwis i naprawy
- `auto_leasing` - Raty leasingowe

**IT (tag: it):**
- `hosting` - Hosting i domeny
- `oprogramowanie` - Licencje software
- `sprzet_it` - Sprzęt komputerowy

**Pozostałe:**
- `marketing` - Marketing i reklama
- `biuro` - Materiały biurowe
- `telefon` - Telefon i internet
- `ksiegowosc` - Usługi księgowe
- `uslugi` - Usługi obce
- `szkolenia` - Szkolenia
- `podroze` - Podróże służbowe
- `inne` - Inne koszty

### Kolumna 17 - Wydatki przyszłe (RMK)
- `rmk` - Rozliczenia międzyokresowe

### Kolumna 18 - Koszty B+R (ulga podatkowa)
- `br_wynagrodzenia` - Wynagrodzenia w B+R
- `br_materialy` - Materiały do B+R
- `br_uslugi` - Usługi B+R
- `br_amortyzacja` - Amortyzacja B+R

## Przykład Użycia API

```javascript
const { createKpirExportService } = require('./src/core/kpirExport');

// Inicjalizacja
const kpirService = createKpirExportService({
  companyData: {
    nip: '1234567890',
    name: 'Moja Firma Sp. z o.o.'
  }
});

// Eksport do wFirma
const result = await kpirService.exportInvoices(invoices, 'wfirma');
// result.content - zawartość pliku
// result.filename - 'wfirma_wydatki_20260122.csv'

// Eksport JPK_PKPIR (dla US)
const jpk = await kpirService.exportInvoices(invoices, 'jpk_pkpir', {
  periodFrom: '2026-01-01',
  periodTo: '2026-12-31',
  purpose: 1 // 1 = złożenie, 2 = korekta
});
```

## Przykład Opisanej Faktury

```json
{
  "id": "inv_001",
  "ksef": {
    "id": "1-1-1-2026-1234567890-20260122-ABCD1234"
  },
  "extracted": {
    "invoiceNumber": "FV/2026/01/001",
    "issueDate": "2026-01-15",
    "seller": {
      "name": "ABC Hosting Sp. z o.o.",
      "nip": "9876543210"
    },
    "amounts": {
      "net": 100.00,
      "vat": 23.00,
      "gross": 123.00,
      "currency": "PLN"
    }
  },
  "description": {
    "category": "hosting",
    "project": "EXEF",
    "notes": "Serwer produkcyjny",
    "tags": ["it", "infrastruktura"]
  }
}
```

## Wpis w KPiR

| Kol. | Wartość |
|------|---------|
| 1 | 1 |
| 2 | 2026-01-15 |
| 3 | 1-1-1-2026-1234567890-20260122-ABCD1234 |
| 4 | FV/2026/01/001 |
| 5 | 9876543210 |
| 6 | ABC Hosting Sp. z o.o. |
| 8 | Hosting i domeny - Serwer produkcyjny - [Projekt: EXEF] |
| 15 | 100,00 |
| 16 | 100,00 |
| 19 | Projekt: EXEF; Tagi: it, infrastruktura |

## Integracja z Workflow

```
┌─────────────────────────────────────────────────────────────┐
│  Unified Inbox (faktury z email/storage/KSeF)               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  OCR Pipeline + Auto-Describe Engine                        │
│  (rozpoznanie danych + sugestia kategorii)                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Opis użytkownika                                           │
│  - Kategoria (paliwo, hosting, B+R...)                      │
│  - Projekt (A, B, EXEF...)                                  │
│  - Tagi (auto, br, infrastruktura...)                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  KPiR Export Service                                        │
│  - Mapowanie na kolumny KPiR 2026                          │
│  - Eksport do wybranego formatu (wFirma/Optima/JPK...)     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Księgowy                                                   │
│  Import gotowych danych do swojego systemu                  │
└─────────────────────────────────────────────────────────────┘
```

## Następne Kroki

1. **[ ]** Testy z rzeczywistymi plikami KSeF XML
2. **[ ]** Walidacja JPK_PKPIR względem schematu MF
3. **[ ]** UI do wyboru formatu eksportu
4. **[ ]** Batch export (wiele miesięcy)
5. **[ ]** Automatyczny eksport do biura rachunkowego (webhook/API)

## Referencje

- [Rozporządzenie MFiG z 6.09.2025 ws. KPiR](https://isap.sejm.gov.pl/)
- [Struktura JPK_PKPIR (3)](https://www.podatki.gov.pl/jpk/)
- [wFirma - import wydatków](https://pomoc.wfirma.pl/)
- [Comarch Optima - import rejestrów](https://www.comarch.pl/erp/)

---

*Softreck Organization / EXEF Project*
