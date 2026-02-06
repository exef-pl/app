"""KSeF import adapter — pulls invoices from KSeF API (or mock server)."""
import re
import json
import urllib.request
import urllib.error
from datetime import date, datetime
from typing import List, Optional

from app.adapters.base import BaseImportAdapter, ImportResult


class KsefImportAdapter(BaseImportAdapter):
    """Import invoices from KSeF (Krajowy System e-Faktur).

    In test/demo mode connects to mock-ksef Docker service.
    In prod mode connects to real KSeF API.
    """

    ENV_URLS = {
        "test": "https://ksef-test.mf.gov.pl/api",
        "demo": "https://ksef-demo.mf.gov.pl/api",
        "prod": "https://ksef.mf.gov.pl/api",
        "mock": "http://mock-ksef:8080/api",  # Docker mock service
    }

    def fetch(self, period_start: Optional[date] = None,
              period_end: Optional[date] = None) -> List[ImportResult]:
        nip = self.config.get("nip", "")
        token = self.config.get("token", "")
        environment = self.config.get("environment", "mock")

        if not nip:
            return []

        base_url = self.ENV_URLS.get(environment, self.ENV_URLS["mock"])

        # Build date range params
        params = f"?nip={nip}"
        if period_start:
            params += f"&dateFrom={period_start.isoformat()}"
        if period_end:
            params += f"&dateTo={period_end.isoformat()}"

        try:
            req = urllib.request.Request(f"{base_url}/invoices{params}", method="GET")
            req.add_header("Accept", "application/json")
            if token:
                req.add_header("Authorization", f"Bearer {token}")

            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))

            results = []
            invoices = data if isinstance(data, list) else data.get("invoices", data.get("items", []))

            for inv in invoices:
                results.append(ImportResult(
                    doc_type="invoice",
                    number=inv.get("number") or inv.get("invoiceNumber"),
                    contractor_name=inv.get("contractor_name") or inv.get("issuerName"),
                    contractor_nip=self._clean_nip(inv.get("contractor_nip") or inv.get("issuerNip")),
                    amount_net=self._to_float(inv.get("amount_net") or inv.get("netAmount")),
                    amount_vat=self._to_float(inv.get("amount_vat") or inv.get("vatAmount")),
                    amount_gross=self._to_float(inv.get("amount_gross") or inv.get("grossAmount")),
                    currency=inv.get("currency", "PLN"),
                    document_date=self._parse_date(inv.get("document_date") or inv.get("invoiceDate")),
                    source="ksef",
                    source_id=f"ksef-{inv.get('ksefReferenceNumber', inv.get('id', ''))}",
                ))

            return results

        except Exception:
            return []

    def test_connection(self) -> dict:
        nip = self.config.get("nip", "")
        environment = self.config.get("environment", "mock")

        if not nip:
            return {"ok": False, "message": "Brak NIP-u."}

        clean_nip = re.sub(r"[\s\-]", "", nip)
        if len(clean_nip) != 10 or not clean_nip.isdigit():
            return {"ok": False, "message": f"Nieprawidłowy format NIP: '{nip}'."}

        # NIP checksum
        weights = [6, 5, 7, 2, 3, 4, 5, 6, 7]
        checksum = sum(int(clean_nip[i]) * weights[i] for i in range(9)) % 11
        if checksum != int(clean_nip[9]):
            return {"ok": False, "message": f"NIP '{clean_nip}' ma nieprawidłową sumę kontrolną."}

        base_url = self.ENV_URLS.get(environment, self.ENV_URLS["mock"])

        try:
            req = urllib.request.Request(f"{base_url}/health", method="GET")
            req.add_header("Accept", "application/json")
            with urllib.request.urlopen(req, timeout=10) as resp:
                return {"ok": True, "message": f"NIP {clean_nip} prawidłowy. Serwer KSeF ({environment}) odpowiada (HTTP {resp.status})."}
        except urllib.error.HTTPError as e:
            return {"ok": True, "message": f"NIP {clean_nip} prawidłowy. Serwer KSeF ({environment}) dostępny (HTTP {e.code})."}
        except Exception as e:
            return {"ok": False, "message": f"NIP {clean_nip} prawidłowy, ale serwer KSeF ({environment}) niedostępny: {str(e)}"}

    @staticmethod
    def _clean_nip(nip) -> Optional[str]:
        if not nip:
            return None
        cleaned = re.sub(r"[\s\-\.]", "", str(nip))
        cleaned = re.sub(r"^PL", "", cleaned, flags=re.IGNORECASE)
        return cleaned[:10] if cleaned and cleaned.isdigit() else None

    @staticmethod
    def _to_float(val) -> Optional[float]:
        if val is None:
            return None
        try:
            return round(float(val), 2)
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _parse_date(val) -> Optional[date]:
        if not val:
            return None
        for fmt in ["%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y"]:
            try:
                return datetime.strptime(str(val).strip()[:10], fmt).date()
            except ValueError:
                continue
        return None
