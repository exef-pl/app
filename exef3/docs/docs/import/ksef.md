# Import z KSeF

Adapter `KsefImportAdapter` pobiera e-faktury z **Krajowego Systemu e-Faktur** (KSeF).

## Konfiguracja źródła

| Parametr | Wymagany | Opis | Przykład |
|----------|----------|------|----------|
| `nip` | Tak | NIP firmy (10 cyfr) | `5213003700` |
| `environment` | Nie | Środowisko KSeF | `mock` / `test` / `demo` / `prod` |
| `token` | Nie | Token autoryzacji KSeF | `Bearer xxx` |

## Środowiska

| Środowisko | URL | Opis |
|------------|-----|------|
| `mock` | `http://mock-ksef:8080/api` | Lokalny serwer testowy (Docker) |
| `test` | `https://ksef-test.mf.gov.pl/api` | Serwer testowy MF |
| `demo` | `https://ksef-demo.mf.gov.pl/api` | Serwer demo MF |
| `prod` | `https://ksef.mf.gov.pl/api` | Serwer produkcyjny MF |

## Walidacja NIP

System waliduje NIP przed połączeniem:

- Usunięcie spacji i myślników
- Sprawdzenie długości (10 cyfr)
- **Suma kontrolna** — algorytm z wagami `[6,5,7,2,3,4,5,6,7]`

## Środowisko testowe (Docker)

Serwer `mock-ksef` (FastAPI) działa na porcie `8180` i zwraca testowe faktury:

- Styczeń 2026: 2 faktury
- Luty 2026: 3 faktury
- Marzec 2026: 5 faktur

Endpoint: `GET /api/invoices?nip=XXX&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD`

!!! note "Mock vs produkcja"
    Serwer mock-ksef jest **lokalną usługą Docker**, nie mockiem w kodzie. 
    Działa jako pełnoprawny serwer HTTP z realistycznymi danymi testowymi.
    Wystarczy zmienić `environment` na `prod` i dodać token, aby połączyć się z prawdziwym KSeF.

## Rozwiązywanie problemów

| Problem | Rozwiązanie |
|---------|------------|
| NIP nieprawidłowy | Sprawdź sumę kontrolną NIP |
| Serwer niedostępny | Sprawdź czy mock-ksef Docker jest uruchomiony |
| Brak wyników | Sprawdź zakres dat — mock ma dane tylko za I-III 2026 |
| Timeout | Serwery MF mogą być wolne — zwiększ timeout |
