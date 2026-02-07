# Eksport Symfonia

Adapter `SymfoniaExportAdapter` generuje plik CSV kompatybilny z importem do **Symfonia Handel**.

## Format pliku

- Separator: `;` (średnik)
- Kodowanie: **CP1250** (Windows-1250)
- Quoting: wszystkie pola w cudzysłowach
- Format daty: `DD.MM.YYYY`

## Kolumny

```text
Lp;Typ;Numer;Data wystawienia;Data operacji;Kontrahent;NIP;
Netto;VAT;Brutto;Stawka VAT;Waluta;Kategoria;Opis
```

## Automatyczne obliczanie stawki VAT

System automatycznie oblicza stawkę VAT z kwot netto i VAT:

- `stawka = round(amount_vat / amount_net * 100)`
- Domyślna: `23%` (jeśli brak danych do obliczenia)

!!! note "Kodowanie CP1250"
    Symfonia wymaga plików w kodowaniu Windows-1250. System automatycznie konwertuje znaki polskie.
