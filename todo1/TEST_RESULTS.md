# EXEF KPiR Export - Wyniki Testów

**Data:** 2026-01-22  
**Status:** ✅ Wszystkie testy przeszły pomyślnie (10/10)

---

## Podsumowanie Testów

| Test | Opis | Status |
|------|------|--------|
| 1 | Mapowanie kategorii na kolumny KPiR | ✅ |
| 2 | Numery KSeF w wpisach | ✅ |
| 3 | Eksport KPiR CSV (19 kolumn) | ✅ |
| 4 | Eksport KPiR Excel (XLSX) | ✅ |
| 5 | Eksport wFirma CSV | ✅ |
| 6 | Eksport Comarch Optima XML | ✅ |
| 7 | Eksport Insert Subiekt EPP | ✅ |
| 8 | Eksport JPK_PKPIR (dla US) | ✅ |
| 9 | Sumy kontrolne | ✅ |
| 10 | Wszystkie formaty | ✅ |

---

## Wygenerowane Pliki

### Uniwersalne

| Plik | Format | Rozmiar | Opis |
|------|--------|---------|------|
| `kpir_20260122.csv` | CSV | 2.2 KB | KPiR 2026 (19 kolumn) |
| `kpir_20260122.xlsx` | Excel | 8.5 KB | KPiR z formułami |
| `JPK_PKPIR_20260101_20260131.xml` | XML | 5.2 KB | JPK dla US |

### Dla Konkretnych Aplikacji

| Plik | Aplikacja | Rozmiar |
|------|-----------|---------|
| `wfirma_wydatki_20260122.csv` | wFirma | 1.7 KB |
| `optima_rejestry_20260122.xml` | Comarch Optima | 5.0 KB |
| `subiekt_20260122.epp` | Insert Subiekt | 2.8 KB |
| `symfonia_20260122.csv` | Symfonia | 1.5 KB |
| `enova_20260122.xml` | enova365 | 5.1 KB |
| `infakt_wydatki_20260122.csv` | inFakt | 1.6 KB |
| `ifirma_20260122.csv` | iFirma | 1.5 KB |
| `fakturownia_20260122.csv` | Fakturownia | 1.6 KB |

---

## Dane Testowe

7 faktur z różnymi kategoriami:

| # | Kontrahent | Kategoria | Kwota netto | Kolumna KPiR |
|---|------------|-----------|-------------|--------------|
| 1 | OVH Hosting | hosting | 200,00 PLN | 15 (pozostałe) |
| 2 | PKN Orlen | paliwo | 162,60 PLN | 15 (pozostałe) [auto] |
| 3 | DevTeam | br_uslugi | 5 000,00 PLN | **18 (B+R)** |
| 4 | Google | marketing | 500,00 PLN | 15 (pozostałe) |
| 5 | IKEA | biuro | 81,30 PLN | 15 (pozostałe) |
| 6 | AB S.A. | towary | 8 500,00 PLN | **12 (towary)** |
| 7 | DHL | transport | 150,00 PLN | **13 (koszty uboczne)** |

### Sumy

- **Kolumna 12 (towary):** 8 500,00 PLN
- **Kolumna 13 (transport):** 150,00 PLN
- **Kolumna 15 (pozostałe):** 943,90 PLN
- **Kolumna 18 (B+R):** 5 000,00 PLN
- **RAZEM (kol. 16):** 14 593,90 PLN

---

## Zgodność z Przepisami

### KPiR 2026 (Rozporządzenie MFiG z 6.09.2025)

- ✅ **19 kolumn** (zamiast poprzednich 17)
- ✅ **Kolumna 3** - Numer KSeF
- ✅ **Kolumna 5** - NIP kontrahenta
- ✅ **Kolumna 18** - Koszty B+R (ulga podatkowa)

### JPK_PKPIR

- ✅ Struktura wersja 3-0
- ✅ Nagłówek z danymi firmy
- ✅ Sekcja PKPiRCtrl z sumami kontrolnymi
- ✅ Wszystkie pola K_1 do K_19

---

## Jak Używać

```javascript
const { createKpirExportService } = require('./src/core/kpirExport');

const service = createKpirExportService({
  companyData: { nip: '1234567890', name: 'Moja Firma' }
});

// Eksport do wFirma
const result = await service.exportInvoices(invoices, 'wfirma');
fs.writeFileSync(result.filename, result.content);

// Eksport JPK_PKPIR dla US
const jpk = await service.exportInvoices(invoices, 'jpk_pkpir', {
  periodFrom: '2026-01-01',
  periodTo: '2026-12-31'
});
```

---

*EXEF / opisz.pl - Softreck Organization*
