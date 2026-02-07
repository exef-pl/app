# Import wyciągów bankowych

Adapter `BankGenericImportAdapter` parsuje wyciągi bankowe w formacie CSV. Dostępne są też dedykowane adaptery dla konkretnych banków.

## Dedykowane adaptery

- `BankINGImportAdapter` — ING Bank Śląski
- `BankMBankImportAdapter` — mBank
- `BankPKOImportAdapter` — PKO Bank Polski
- `BankSantanderImportAdapter` — Santander Bank Polska
- `BankPekaoImportAdapter` — Bank Pekao SA

## Automatyczne rozpoznawanie kolumn

Generyczny adapter rozpoznaje kolumny po nazwie:

- **Kwota**: `kwota`, `amount`, `wartosc`, `wartość`, `suma`, `brutto`
- **Tytuł**: `tytul`, `tytuł`, `title`, `opis`, `description`
- **Kontrahent**: `kontrahent`, `nadawca`, `odbiorca`, `nazwa`, `name`
- **NIP**: `nip`
- **Data**: `data`, `date`, `data_operacji`, `data_transakcji`

## Ekstrakcja numeru faktury

System próbuje wyciągnąć numer faktury z tytułu przelewu:

- Wzorce: `FV/123`, `FA-456`, `FZ 789`
- Regex: `(FV|FA|FZ)[/\-\s]?\d+`

## Typy dokumentów

- Kwota dodatnia → `payment_in` (wpłata)
- Kwota ujemna → `payment_out` (wypłata)
