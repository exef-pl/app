# EXEF — System zarządzania dokumentami księgowymi

Witaj w dokumentacji systemu **EXEF**. System służy do importu, opisywania i eksportu dokumentów księgowych dla biur rachunkowych.

## Główne funkcje

| Funkcja | Opis |
|---------|------|
| **Import dokumentów** | Automatyczne pobieranie faktur z email (IMAP), KSeF, plików CSV, wyciągów bankowych |
| **Opisywanie** | Kategoryzacja, tagowanie, opis dokumentów z walidacją |
| **Eksport** | Generowanie plików do wFirma, JPK_PKPIR, Comarch Optima, Symfonia, enova365, CSV |
| **Deduplikacja** | Automatyczne wykrywanie i grupowanie duplikatów dokumentów |

## Szybki start

### 1. Import dokumentów

Przejdź do zadania → zakładka **📥 Import** w prawym panelu.

- Kliknij **Importuj** przy wybranym źródle (email, KSeF)
- System automatycznie pobierze dokumenty z skonfigurowanego źródła
- Duplikaty są automatycznie wykrywane i pomijane

### 2. Opisywanie dokumentów

Kliknij na dokument w tabeli → edytuj metadane w prawym panelu:

- **Kategoria** — klasyfikacja księgowa (np. "Koszty operacyjne")
- **Tagi** — dowolne etykiety
- **Opis** — dodatkowe informacje

### 3. Eksport

Zakładka **📤 Eksport** → wybierz format → pobierz plik.

## Źródła importu

| Typ | Opis | Wymaga konfiguracji |
|-----|------|---------------------|
| 📧 Email (IMAP) | Skanuje skrzynkę email w poszukiwaniu faktur | Tak — serwer, login, hasło |
| 🏛️ KSeF | Pobiera e-faktury z Krajowego Systemu e-Faktur | Tak — NIP, token |
| 📄 CSV Upload | Wczytuje dokumenty z pliku CSV | Nie |
| 🏦 Wyciąg bankowy | Parsuje wyciągi bankowe (ING, mBank, PKO, Santander, Pekao) | Nie |
| ✍️ Ręczne | Ręczne dodawanie dokumentów przez formularz | Nie |
| 🔗 Webhook | Przyjmuje dokumenty z zewnętrznych systemów | Opcjonalnie — URL |

## Formaty eksportu

| Format | Plik | Kodowanie |
|--------|------|-----------|
| wFirma | CSV (`;`) | UTF-8 BOM |
| JPK_PKPIR | XML | UTF-8 |
| Comarch Optima | XML | UTF-8 |
| Symfonia | CSV (`;`) | CP1250 |
| enova365 | XML | UTF-8 |
| CSV (generyczny) | CSV (`;`) | UTF-8 BOM |

## Pomoc

- **Import nie działa?** → Zobacz [Email](import/email.md) lub [KSeF](import/ksef.md)
- **Duplikaty?** → Zobacz [Duplikaty](duplicates.md)
- **API** → Zobacz [API](api.md)
- **Architektura** → Zobacz [Adaptery](architecture/adapters.md)
