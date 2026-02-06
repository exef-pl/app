"""Generic CSV export adapter."""
import csv
import io
from datetime import datetime

from app.adapters.base import BaseExportAdapter, ExportResult


class CsvExportAdapter(BaseExportAdapter):
    """Export documents to generic CSV format."""

    def export(self, documents: list, task_name: str = "") -> ExportResult:
        delimiter = self.config.get("delimiter", ";")
        encoding = self.config.get("encoding", "utf-8-sig")
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

        output = io.StringIO()
        writer = csv.writer(output, delimiter=delimiter, quoting=csv.QUOTE_MINIMAL)

        writer.writerow([
            "Lp", "Typ", "Numer", "Data", "Kontrahent", "NIP",
            "Netto", "VAT", "Brutto", "Waluta", "Kategoria", "Opis",
        ])

        for idx, doc in enumerate(documents, 1):
            meta = doc.document_metadata
            writer.writerow([
                idx,
                doc.doc_type or "invoice",
                doc.number or "",
                str(doc.document_date or ""),
                doc.contractor_name or "",
                doc.contractor_nip or "",
                f"{doc.amount_net or 0:.2f}",
                f"{doc.amount_vat or 0:.2f}",
                f"{doc.amount_gross or 0:.2f}",
                doc.currency or "PLN",
                meta.category if meta else "",
                meta.description if meta and meta.description else "",
            ])

        content = output.getvalue()
        filename = f"export_{timestamp}.csv"

        return ExportResult(
            content=content,
            filename=filename,
            format="csv",
            docs_exported=len(documents),
            encoding=encoding,
        )

    def test_connection(self) -> dict:
        return {"ok": True, "message": "Eksport CSV generuje plik do pobrania — nie wymaga połączenia."}
