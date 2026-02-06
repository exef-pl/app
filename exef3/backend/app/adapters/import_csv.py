"""CSV import adapter — already functional, wraps existing CSV parsing logic."""
from datetime import date
from typing import List, Optional

from app.adapters.base import BaseImportAdapter, ImportResult


class CsvImportAdapter(BaseImportAdapter):
    """Import documents from CSV file content.

    This adapter is used when CSV content is provided via config._content
    (e.g. from upload or pre-loaded test data).
    The actual CSV upload endpoint in sources.py handles file upload directly.
    """

    def fetch(self, period_start: Optional[date] = None,
              period_end: Optional[date] = None) -> List[ImportResult]:
        import csv
        import io
        import re
        from datetime import datetime

        content = self.config.get("_content", "")
        if not content:
            return []

        delimiter = ";" if content.split("\n")[0].count(";") > content.split("\n")[0].count(",") else ","
        reader = csv.DictReader(io.StringIO(content), delimiter=delimiter)

        COL_MAP = {
            "number": ["number", "numer", "nr", "nr_dokumentu", "numer_faktury"],
            "contractor_name": ["contractor_name", "kontrahent", "nazwa", "dostawca", "odbiorca"],
            "contractor_nip": ["contractor_nip", "nip", "nip_kontrahenta"],
            "amount_net": ["amount_net", "netto", "kwota_netto"],
            "amount_vat": ["amount_vat", "vat", "kwota_vat"],
            "amount_gross": ["amount_gross", "brutto", "kwota_brutto", "kwota"],
            "document_date": ["document_date", "data", "date", "data_dokumentu"],
            "doc_type": ["doc_type", "typ", "type"],
            "description": ["description", "opis"],
            "category": ["category", "kategoria"],
        }

        results = []
        for row_idx, row in enumerate(reader, 1):
            row_lower = {k.lower().strip(): v.strip() for k, v in row.items() if k and v}
            mapped = {}
            for field, aliases in COL_MAP.items():
                for alias in aliases:
                    if alias in row_lower and row_lower[alias]:
                        mapped[field] = row_lower[alias]
                        break

            if not mapped.get("number") and not mapped.get("amount_gross") and not mapped.get("contractor_name"):
                continue

            results.append(ImportResult(
                doc_type=mapped.get("doc_type", "invoice"),
                number=mapped.get("number"),
                contractor_name=mapped.get("contractor_name"),
                contractor_nip=self._clean_nip(mapped.get("contractor_nip")),
                amount_net=self._parse_amount(mapped.get("amount_net")),
                amount_vat=self._parse_amount(mapped.get("amount_vat")),
                amount_gross=self._parse_amount(mapped.get("amount_gross")),
                document_date=self._parse_date(mapped.get("document_date")),
                source="csv",
                source_id=f"csv-row{row_idx}",
                description=mapped.get("description"),
                category=mapped.get("category"),
            ))

        return results

    @staticmethod
    def _clean_nip(nip):
        if not nip:
            return None
        import re
        cleaned = re.sub(r"[\s\-\.]", "", str(nip))
        return cleaned[:10] if cleaned and cleaned.isdigit() else None

    @staticmethod
    def _parse_amount(val):
        if not val:
            return None
        import re
        cleaned = re.sub(r"[^\d,.\-]", "", str(val))
        cleaned = cleaned.replace(",", ".")
        parts = cleaned.split(".")
        if len(parts) > 2:
            cleaned = "".join(parts[:-1]) + "." + parts[-1]
        try:
            return round(float(cleaned), 2)
        except ValueError:
            return None

    @staticmethod
    def _parse_date(val):
        if not val:
            return None
        from datetime import datetime
        for fmt in ["%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%Y"]:
            try:
                return datetime.strptime(str(val).strip(), fmt).date()
            except ValueError:
                continue
        return None
