"""Bank statement import adapters — parse CSV/MT940 bank statements."""
import csv
import io
import re
from datetime import date, datetime
from typing import List, Optional

from app.adapters.base import BaseImportAdapter, ImportResult


class BankGenericImportAdapter(BaseImportAdapter):
    """Generic bank statement CSV parser. Auto-detects common column patterns."""

    def fetch(self, period_start: Optional[date] = None,
              period_end: Optional[date] = None) -> List[ImportResult]:
        # Bank adapters work via upload — config may contain pre-loaded content
        content = self.config.get("_content", "")
        if not content:
            return []
        return self._parse_bank_csv(content, "bank")

    def _parse_bank_csv(self, content: str, source_prefix: str) -> List[ImportResult]:
        delimiter = ";" if content.split("\n")[0].count(";") > content.split("\n")[0].count(",") else ","
        reader = csv.DictReader(io.StringIO(content), delimiter=delimiter)
        results = []

        for idx, row in enumerate(reader, 1):
            row_lower = {k.lower().strip(): v.strip() for k, v in row.items() if k and v}
            parsed = self._map_row(row_lower)
            if parsed:
                parsed.source = source_prefix
                parsed.source_id = f"{source_prefix}-row{idx}"
                results.append(parsed)

        return results

    def _map_row(self, row: dict) -> Optional[ImportResult]:
        """Map generic bank CSV row to ImportResult."""
        amount = self._find_value(row, ["kwota", "amount", "wartosc", "wartość", "suma", "brutto"])
        title = self._find_value(row, ["tytul", "tytuł", "title", "opis", "description", "tytułem"])
        contractor = self._find_value(row, ["kontrahent", "nadawca", "odbiorca", "nazwa", "name", "sender"])
        nip = self._find_value(row, ["nip"])
        date_str = self._find_value(row, ["data", "date", "data_operacji", "data operacji", "data_transakcji"])

        if not amount and not title:
            return None

        amount_val = self._parse_amount(amount)
        # Only import incoming payments (positive amounts) for invoices
        doc_type = "payment_in" if amount_val and amount_val > 0 else "payment_out"

        # Try to extract invoice number from title
        fv_match = re.search(r"(FV|FA|FZ)[/\-\s]?\d+", title or "", re.IGNORECASE) if title else None

        return ImportResult(
            doc_type=doc_type,
            number=fv_match.group(0) if fv_match else None,
            contractor_name=contractor,
            contractor_nip=self._clean_nip(nip),
            amount_gross=abs(amount_val) if amount_val else None,
            document_date=self._parse_date(date_str),
            description=title,
            category="Przelew bankowy",
        )

    @staticmethod
    def _find_value(row: dict, keys: list) -> Optional[str]:
        for k in keys:
            for rk, rv in row.items():
                if k in rk and rv:
                    return rv
        return None

    @staticmethod
    def _parse_amount(val) -> Optional[float]:
        if not val:
            return None
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
    def _parse_date(val) -> Optional[date]:
        if not val:
            return None
        for fmt in ["%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%Y", "%Y%m%d"]:
            try:
                return datetime.strptime(str(val).strip()[:10], fmt).date()
            except ValueError:
                continue
        return None

    @staticmethod
    def _clean_nip(nip) -> Optional[str]:
        if not nip:
            return None
        cleaned = re.sub(r"[\s\-\.]", "", str(nip))
        return cleaned[:10] if cleaned and cleaned.isdigit() and len(cleaned) >= 10 else None


class BankINGImportAdapter(BankGenericImportAdapter):
    """ING Bank Śląski CSV statement parser.
    ING format: Data transakcji;Data księgowania;Dane kontrahenta;Tytuł;Nr rachunku;Nazwa banku;Szczegóły;Nr transakcji;Kwota;Waluta;Saldo po transakcji
    """

    def _map_row(self, row: dict) -> Optional[ImportResult]:
        amount_str = self._find_value(row, ["kwota"])
        title = self._find_value(row, ["tytuł", "tytul", "title"])
        contractor = self._find_value(row, ["dane kontrahenta", "kontrahent"])
        date_str = self._find_value(row, ["data transakcji", "data"])
        details = self._find_value(row, ["szczegóły", "szczegoly"])

        amount = self._parse_amount(amount_str)
        if amount is None:
            return None

        fv_match = re.search(r"(FV|FA|FZ)[/\-\s]?\S+", (title or "") + " " + (details or ""), re.IGNORECASE)
        nip_match = re.search(r"NIP[:\s]*(\d{10})", (title or "") + " " + (details or ""))

        return ImportResult(
            doc_type="payment_in" if amount > 0 else "payment_out",
            number=fv_match.group(0) if fv_match else None,
            contractor_name=contractor,
            contractor_nip=nip_match.group(1) if nip_match else None,
            amount_gross=abs(amount),
            currency=self._find_value(row, ["waluta"]) or "PLN",
            document_date=self._parse_date(date_str),
            source="bank_ing",
            description=title,
            category="Przelew bankowy – ING",
        )


class BankMBankImportAdapter(BankGenericImportAdapter):
    """mBank CSV statement parser.
    mBank format: #Data operacji;#Opis operacji;#Rachunek;#Kategoria;#Kwota;#Saldo po operacji;
    """

    def _map_row(self, row: dict) -> Optional[ImportResult]:
        amount_str = self._find_value(row, ["kwota", "#kwota"])
        description = self._find_value(row, ["opis operacji", "#opis operacji", "opis"])
        category = self._find_value(row, ["kategoria", "#kategoria"])
        date_str = self._find_value(row, ["data operacji", "#data operacji", "data"])

        amount = self._parse_amount(amount_str)
        if amount is None:
            return None

        fv_match = re.search(r"(FV|FA|FZ)[/\-\s]?\S+", description or "", re.IGNORECASE)
        # mBank often puts contractor in description
        contractor = None
        if description:
            lines = description.split(";")
            if len(lines) > 1:
                contractor = lines[0].strip()

        return ImportResult(
            doc_type="payment_in" if amount > 0 else "payment_out",
            number=fv_match.group(0) if fv_match else None,
            contractor_name=contractor,
            amount_gross=abs(amount),
            document_date=self._parse_date(date_str),
            source="bank_mbank",
            description=description,
            category=category or "Przelew bankowy – mBank",
        )


class BankPKOImportAdapter(BankGenericImportAdapter):
    """PKO BP CSV statement parser.
    PKO format: Data operacji;Data waluty;Typ transakcji;Kwota;Waluta;Saldo po transakcji;Opis transakcji
    """

    def _map_row(self, row: dict) -> Optional[ImportResult]:
        amount_str = self._find_value(row, ["kwota"])
        description = self._find_value(row, ["opis transakcji", "opis"])
        tx_type = self._find_value(row, ["typ transakcji", "typ"])
        date_str = self._find_value(row, ["data operacji", "data"])

        amount = self._parse_amount(amount_str)
        if amount is None:
            return None

        fv_match = re.search(r"(FV|FA|FZ)[/\-\s]?\S+", description or "", re.IGNORECASE)
        nip_match = re.search(r"NIP[:\s]*(\d{10})", description or "")
        # PKO puts contractor name in description, usually after "Nazwa nadawcy:"
        contractor_match = re.search(r"Nazwa (nadawcy|odbiorcy)[:\s]*(.+?)(?:\s*Adres|\s*Tytuł|\s*$)", description or "")

        return ImportResult(
            doc_type="payment_in" if amount > 0 else "payment_out",
            number=fv_match.group(0) if fv_match else None,
            contractor_name=contractor_match.group(2).strip() if contractor_match else None,
            contractor_nip=nip_match.group(1) if nip_match else None,
            amount_gross=abs(amount),
            currency=self._find_value(row, ["waluta"]) or "PLN",
            document_date=self._parse_date(date_str),
            source="bank_pko",
            description=description,
            category=tx_type or "Przelew bankowy – PKO BP",
        )


class BankSantanderImportAdapter(BankGenericImportAdapter):
    """Santander Bank Polska CSV parser."""

    def _map_row(self, row: dict) -> Optional[ImportResult]:
        result = super()._map_row(row)
        if result:
            result.source = "bank_santander"
            result.category = result.category or "Przelew bankowy – Santander"
        return result


class BankPekaoImportAdapter(BankGenericImportAdapter):
    """Bank Pekao S.A. CSV parser."""

    def _map_row(self, row: dict) -> Optional[ImportResult]:
        result = super()._map_row(row)
        if result:
            result.source = "bank_pekao"
            result.category = result.category or "Przelew bankowy – Pekao"
        return result
