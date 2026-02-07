# Eksport Comarch Optima

Adapter `ComarchExportAdapter` generuje plik XML kompatybilny z importem do **Comarch ERP Optima**.

## Format

- Plik: XML
- Element główny: `REJESTRY_ZAKUPOW_VAT`
- Każdy dokument jako: `REJESTR_ZAKUPOW_VAT`

## Generowane pola

- `NUMER_OBCY` — numer dokumentu
- `PODMIOT_NAZWA1` — nazwa kontrahenta
- `PODMIOT_NIP` — NIP kontrahenta
- `DATA_WYSTAWIENIA` / `DATA_ZAKUPU` — data dokumentu
- `STAWKA_VAT`, `NETTO`, `VAT`, `BRUTTO` — kwoty
- `KATEGORIA` — kategoria z metadanych
- `OPIS` — opis z metadanych
- `PLATNOSC_TYP` — zawsze "przelew"
