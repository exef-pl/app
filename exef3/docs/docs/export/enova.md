# Eksport enova365

Adapter `EnovaExportAdapter` generuje plik XML kompatybilny z importem do **enova365**.

## Format

- Plik: XML
- Element główny: `ImportDokumentow`
- Każdy dokument jako: `DokumentZakupu`

## Struktura dokumentu

- `Numer` — numer dokumentu
- `DataWystawienia` / `DataWplywu` — data dokumentu
- `Kontrahent` → `Nazwa`, `NIP`
- `Pozycje` → `Pozycja` → `Netto`, `VAT`, `Brutto`, `StawkaVAT`, `Opis`
- `Uwagi` — opis z metadanych
