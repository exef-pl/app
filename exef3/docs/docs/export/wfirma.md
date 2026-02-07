# Eksport wFirma

Adapter `WfirmaExportAdapter` generuje plik CSV kompatybilny z importem wFirma.

## Format pliku

- Separator: `;` (średnik)
- Kodowanie: UTF-8 BOM
- Nagłówki: tak

## Kolumny

```
Lp;Typ dokumentu;Numer dokumentu;Data wystawienia;Data sprzedaży;
Kontrahent;NIP kontrahenta;Netto;Stawka VAT;VAT;Brutto;
Waluta;Kategoria księgowa;Opis
```

## Mapowanie typów dokumentów

| Typ w EXEF | Typ w wFirma |
|-----------|-------------|
| `invoice` | Faktura VAT |
| `correction` | Faktura korygująca |
| `receipt` | Paragon |
| `contract` | Umowa |
| `payment_in` | Wpłata |
| `payment_out` | Wypłata |
