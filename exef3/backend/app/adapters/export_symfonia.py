"""Symfonia CSV export adapter."""
import csv
import io
from datetime import datetime

from app.adapters.base import BaseExportAdapter, ExportResult


class SymfoniaExportAdapter(BaseExportAdapter):
    """Export documents to Symfonia Handel CSV format.

    Symfonia uses semicolon-separated CSV with CP1250 encoding.
    """

    def export(self, documents: list, task_name: str = "") -> ExportResult:
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

        output = io.StringIO()
        writer = csv.writer(output, delimiter=";", quoting=csv.QUOTE_ALL)

        writer.writerow([
            "Lp", "Typ", "Numer", "Data wystawienia", "Data operacji",
            "Kontrahent", "NIP", "Netto", "VAT", "Brutto",
            "Stawka VAT", "Waluta", "Kategoria", "Opis",
        ])

        for idx, doc in enumerate(documents, 1):
            meta = doc.document_metadata
            doc_date = doc.document_date.strftime("%d.%m.%Y") if doc.document_date else ""
            vat_rate = "23%"
            if doc.amount_net and doc.amount_vat and doc.amount_net > 0:
                vat_rate = f"{round(doc.amount_vat / doc.amount_net * 100)}%"

            writer.writerow([
                idx,
                "FZ" if doc.doc_type == "invoice" else doc.doc_type or "FZ",
                doc.number or "",
                doc_date,
                doc_date,
                doc.contractor_name or "",
                doc.contractor_nip or "",
                f"{doc.amount_net or 0:.2f}".replace(".", ","),
                f"{doc.amount_vat or 0:.2f}".replace(".", ","),
                f"{doc.amount_gross or 0:.2f}".replace(".", ","),
                vat_rate,
                doc.currency or "PLN",
                meta.category if meta else "",
                meta.description if meta and meta.description else "",
            ])

        content = output.getvalue()
        filename = f"symfonia_import_{timestamp}.csv"

        return ExportResult(
            content=content,
            filename=filename,
            format="csv",
            docs_exported=len(documents),
            encoding="cp1250",
        )

    def test_connection(self) -> dict:
        return {"ok": True, "message": "Eksport Symfonia generuje plik CSV (CP1250) do importu — nie wymaga połączenia."}
