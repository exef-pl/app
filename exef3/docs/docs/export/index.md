# Eksport dokumentów

System EXEF generuje pliki eksportu w formatach kompatybilnych z popularnymi programami księgowymi.

## Dostępne formaty

| Format | Adapter | Plik | Kodowanie |
|--------|---------|------|-----------|
| [wFirma](wfirma.md) | `WfirmaExportAdapter` | CSV (`;`) | UTF-8 BOM |
| [JPK_PKPIR](jpk.md) | `JpkPkpirExportAdapter` | XML | UTF-8 |
| [Comarch Optima](comarch.md) | `ComarchExportAdapter` | XML | UTF-8 |
| [Symfonia](symfonia.md) | `SymfoniaExportAdapter` | CSV (`;`) | CP1250 |
| [enova365](enova.md) | `EnovaExportAdapter` | XML | UTF-8 |
| [CSV](csv.md) | `CsvExportAdapter` | CSV (`;`) | UTF-8 BOM |

## Jak eksportować?

1. Przejdź do zadania z dokumentami
2. Kliknij zakładkę **📤 Eksport** w prawym panelu
3. Wybierz format eksportu
4. Kliknij **Eksportuj** — plik zostanie wygenerowany i pobrany
5. Dokumenty zostaną oznaczone jako `exported`

## Proces eksportu

```text
Użytkownik wybiera źródło eksportu + kliknij "Eksportuj"
    ↓
Backend pobiera dokumenty zadania (status != exported lub wszystkie)
    ↓
get_export_adapter(source_type) → ExportAdapterClass
    ↓
adapter.export(documents, task_name) → ExportResult
    ↓
Zapis ExportRun + oznaczenie dokumentów jako exported
    ↓
Plik do pobrania przez /export-runs/{id}/download
```

!!! note "Eksporty offline"
    Wszystkie adaptery eksportu generują pliki lokalnie — nie wymagają połączenia z zewnętrznym systemem. Test połączenia zawsze zwraca `ok`.
