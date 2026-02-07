# Ręczne / Upload / Webhook

Te adaptery nie pobierają dokumentów automatycznie — są pasywne.

## ManualImportAdapter (`manual`)

Ręczne dodawanie dokumentów przez formularz w UI. Adapter nie wykonuje żadnego pobierania — dokumenty tworzone są bezpośrednio przez API `POST /documents`.

## UploadImportAdapter (`upload`)

Upload plików przez UI. Pliki przesyłane są przez endpoint `POST /flow/upload-csv` i parsowane server-side przez `CsvImportAdapter`.

## WebhookImportAdapter (`webhook`)

Przyjmuje dokumenty z zewnętrznych systemów przez HTTP POST. Konfiguracja opcjonalna:

- `url` — adres URL webhooka (informacyjny)

Wszystkie trzy adaptery zwracają `test_connection: ok` — nie wymagają konfiguracji połączenia.
