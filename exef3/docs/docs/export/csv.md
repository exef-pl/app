# Eksport CSV (generyczny)

Adapter `CsvExportAdapter` generuje uniwersalny plik CSV.

## Konfiguracja

| Parametr | Domyślnie | Opis |
|----------|-----------|------|
| `delimiter` | `;` | Separator kolumn |
| `encoding` | `utf-8-sig` | Kodowanie pliku |

## Kolumny

```text
Lp;Typ;Numer;Data;Kontrahent;NIP;Netto;VAT;Brutto;Waluta;Kategoria;Opis
```

Ten format jest uniwersalny i może być zaimportowany do dowolnego arkusza kalkulacyjnego lub systemu księgowego obsługującego CSV.
