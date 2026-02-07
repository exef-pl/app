# Eksport JPK_PKPIR

Adapter `JpkPkpirExportAdapter` generuje plik XML zgodny ze schematem **JPK_PKPIR(3)** — Jednolity Plik Kontrolny dla Podatkowej Księgi Przychodów i Rozchodów.

## Konfiguracja

| Parametr | Wymagany | Opis |
|----------|----------|------|
| `nip` | Tak | NIP firmy |
| `company_name` | Tak | Pełna nazwa firmy |

## Struktura XML

```xml
<JPK xmlns="http://jpk.mf.gov.pl/wzor/2022/02/17/02171/">
  <Naglowek>
    <KodFormularza kodSystemowy="JPK_PKPIR (3)">JPK_PKPIR</KodFormularza>
    <DataOd>...</DataOd>
    <DataDo>...</DataDo>
  </Naglowek>
  <Podmiot1>
    <NIP>...</NIP>
    <PelnaNazwa>...</PelnaNazwa>
  </Podmiot1>
  <PKPIRWiersze>
    <PKPIRWiersz>
      <K_1>Lp</K_1>
      <K_2>Data</K_2>
      <K_3>Numer</K_3>
      <K_4>Kontrahent</K_4>
      <K_5>NIP</K_5>
      <K_6>Kategoria</K_6>
      <K_13>Netto (kol. 13 - pozostałe)</K_13>
      <K_14>VAT</K_14>
      <K_15>Brutto</K_15>
    </PKPIRWiersz>
  </PKPIRWiersze>
</JPK>
```

## Klasyfikacja kolumn PKPIR

- Kolumna 10 — zakup towarów (kategoria zawiera: "towar", "materiał", "zakup")
- Kolumna 13 — pozostałe wydatki (domyślna)

!!! warning "Test połączenia"
    Wymaga podania NIP i nazwy firmy w konfiguracji źródła. Bez nich test zwróci błąd.
