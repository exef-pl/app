# Import z Email (IMAP)

Adapter `EmailImportAdapter` łączy się z serwerem IMAP i skanuje skrzynkę email w poszukiwaniu faktur.

## Konfiguracja źródła

| Parametr | Wymagany | Opis | Przykład |
|----------|----------|------|----------|
| `host` | Tak | Adres serwera IMAP | `imap.gmail.com` |
| `port` | Tak | Port (993=SSL, 143=plain) | `993` |
| `username` | Tak | Login / email | `biuro@firma.pl` |
| `password` | Tak | Hasło / app password | `****` |
| `folder` | Nie | Folder IMAP | `INBOX` (domyślnie) |
| `days_back` | Nie | Rozszerzenie okna wyszukiwania | `30` (domyślnie) |

## Obsługiwane formaty załączników

| Format | Parsowanie |
|--------|-----------|
| **CSV** | Automatyczne mapowanie kolumn (numer, kontrahent, kwota, data) |
| **XML** | Parsowanie faktur e-faktura / KSeF XML |
| **PDF** | Ekstrakcja metadanych z nazwy pliku (numer faktury, data) |
| **Treść email** | Parsowanie tekstu email jeśli brak załączników |

## Jak działa filtrowanie dat?

1. System wyszukuje emaile z datą `SINCE (period_start - days_back)`
2. Parsuje znalezione dokumenty
3. Post-filtruje wyniki — zostawia tylko dokumenty z `document_date` w zakresie `[period_start, period_end]`

!!! info "Dlaczego days_back?"
    Serwery IMAP filtrują po dacie **wewnętrznej** emaila (data otrzymania), a nie po dacie dokumentu.
    Email z fakturą za marzec może być wysłany w lutym. Parametr `days_back` rozszerza okno wyszukiwania.

## Testowanie połączenia

Kliknij **🔌 Test** przy źródle w panelu konfiguracji. System sprawdzi:

- Połączenie z serwerem IMAP
- Poprawność loginu i hasła
- Dostępność wybranego folderu
- Liczbę wiadomości w folderze

## Środowisko testowe

W Docker Compose dostępny jest serwer testowy `test-imap` (Dovecot) z seedowanymi emailami:

```
host: test-imap
port: 143
username: testuser
password: testpass
```

Zawiera 7+ testowych emaili z fakturami CSV, XML, PDF i w treści.

## Rozwiązywanie problemów

| Problem | Rozwiązanie |
|---------|------------|
| Brak wyników | Zwiększ `days_back` lub sprawdź zakres dat zadania |
| Timeout | Sprawdź firewall / port / SSL |
| Login failed | Dla Gmail użyj App Password, nie hasła konta |
| Brak załączników | System spróbuje sparsować treść emaila |
