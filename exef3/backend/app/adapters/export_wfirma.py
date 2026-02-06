"""wFirma CSV export adapter — generates CSV in wFirma import format."""
import csv
import io
from datetime import datetime

from app.adapters.base import BaseExportAdapter, ExportResult


class WfirmaExportAdapter(BaseExportAdapter):
    """Export documents to wFirma CSV format.

    wFirma CSV import format (semicolon-separated):
    Lp;Typ;Numer;Data wystawienia;Data sprzedaży;Kontrahent;NIP;Netto;Stawka VAT;VAT;Brutto;Kategoria;Opis
    """

    def export(self, documents: list, task_name: str = "") -> ExportResult:
        encoding = self.config.get("encoding", "utf-8-sig")
        date_format = self.config.get("date_format", "%Y-%m-%d")
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

        output = io.StringIO()
        writer = csv.writer(output, delimiter=";", quoting=csv.QUOTE_MINIMAL)

        # wFirma header
        writer.writerow([
            "Lp", "Typ dokumentu", "Numer dokumentu", "Data wystawienia",
            "Data sprzedaży", "Kontrahent", "NIP kontrahenta",
            "Netto", "Stawka VAT", "VAT", "Brutto",
            "Waluta", "Kategoria księgowa", "Opis",
        ])

        for idx, doc in enumerate(documents, 1):
            meta = doc.document_metadata
            doc_date = doc.document_date.strftime(date_format) if doc.document_date else ""
            vat_rate = ""
            if doc.amount_net and doc.amount_vat and doc.amount_net > 0:
                rate = round(doc.amount_vat / doc.amount_net * 100)
                vat_rate = f"{rate}%"

            writer.writerow([
                idx,
                self._map_doc_type(doc.doc_type),
                doc.number or "",
                doc_date,
                doc_date,  # data sprzedaży = data wystawienia
                doc.contractor_name or "",
                doc.contractor_nip or "",
                f"{doc.amount_net or 0:.2f}",
                vat_rate,
                f"{doc.amount_vat or 0:.2f}",
                f"{doc.amount_gross or 0:.2f}",
                doc.currency or "PLN",
                meta.category if meta else "",
                meta.description if meta else "",
            ])

        content = output.getvalue()
        filename = f"wfirma_import_{timestamp}.csv"

        return ExportResult(
            content=content,
            filename=filename,
            format="csv",
            docs_exported=len(documents),
            encoding=encoding,
        )

    def test_connection(self) -> dict:
        return {"ok": True, "message": "Eksport wFirma generuje plik CSV do pobrania — nie wymaga połączenia."}

    @staticmethod
    def _map_doc_type(doc_type: str) -> str:
        mapping = {
            "invoice": "Faktura VAT",
            "correction": "Faktura korygująca",
            "receipt": "Paragon",
            "contract": "Umowa",
            "payment_in": "Wpłata",
            "payment_out": "Wypłata",
        }
        return mapping.get(doc_type, "Faktura VAT")
