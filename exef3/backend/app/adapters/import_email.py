"""Email (IMAP) import adapter — connects to IMAP, parses invoice emails."""
import imaplib
import email
import re
import socket
from datetime import date, datetime
from typing import List, Optional

from app.adapters.base import BaseImportAdapter, ImportResult


class EmailImportAdapter(BaseImportAdapter):
    """Import invoices from IMAP email server.

    Scans inbox (or configured folder) for emails with invoice attachments
    or invoice data in the body. Parses PDF/XML attachments and plain-text
    invoice summaries.
    """

    def fetch(self, period_start: Optional[date] = None,
              period_end: Optional[date] = None) -> List[ImportResult]:
        host = self.config.get("host", "")
        port = int(self.config.get("port", 993))
        username = self.config.get("username", "")
        password = self.config.get("password", "")
        folder = self.config.get("folder", "INBOX")
        days_back = int(self.config.get("days_back", 30))

        if not host or not username:
            return []

        try:
            if port == 993:
                mail = imaplib.IMAP4_SSL(host, port, timeout=15)
            else:
                mail = imaplib.IMAP4(host, port, timeout=15)

            if password:
                mail.login(username, password)

            status, _ = mail.select(folder, readonly=True)
            if status != "OK":
                return []

            # Search for recent emails
            since_date = period_start or date.today().replace(day=1)
            search_date = since_date.strftime("%d-%b-%Y")
            _, msg_ids = mail.search(None, f'(SINCE "{search_date}")')

            results = []
            for msg_id in msg_ids[0].split():
                if not msg_id:
                    continue
                _, msg_data = mail.fetch(msg_id, "(RFC822)")
                if not msg_data or not msg_data[0]:
                    continue

                raw = msg_data[0][1]
                msg = email.message_from_bytes(raw)
                docs = self._parse_email(msg, msg_id.decode())
                results.extend(docs)

            mail.logout()
            return results

        except Exception:
            return []

    def _parse_email(self, msg, msg_id: str) -> List[ImportResult]:
        """Parse a single email for invoice data."""
        results = []
        subject = self._decode_header(msg.get("Subject", ""))
        from_addr = self._decode_header(msg.get("From", ""))
        msg_date = email.utils.parsedate_to_datetime(msg.get("Date", "")) if msg.get("Date") else None

        # Check attachments
        for part in msg.walk():
            content_type = part.get_content_type()
            filename = part.get_filename()
            if not filename:
                continue

            filename = self._decode_header(filename)
            payload = part.get_payload(decode=True)
            if not payload:
                continue

            # Parse CSV attachments as potential invoice lists
            if filename.lower().endswith(".csv"):
                csv_docs = self._parse_csv_attachment(payload, filename, from_addr, msg_date)
                results.extend(csv_docs)
            # Parse XML (potential KSeF/e-invoice)
            elif filename.lower().endswith(".xml"):
                xml_docs = self._parse_xml_attachment(payload, filename, from_addr, msg_date)
                results.extend(xml_docs)
            # PDF — extract metadata from filename
            elif filename.lower().endswith(".pdf"):
                doc = self._parse_pdf_filename(filename, from_addr, msg_date)
                if doc:
                    results.append(doc)

        # If no attachments, try parsing email body for invoice info
        if not results:
            body_doc = self._parse_body(msg, subject, from_addr, msg_date, msg_id)
            if body_doc:
                results.append(body_doc)

        return results

    def _parse_csv_attachment(self, payload: bytes, filename: str,
                              from_addr: str, msg_date) -> List[ImportResult]:
        """Parse CSV attachment as invoice list."""
        import csv
        import io

        results = []
        for enc in ["utf-8-sig", "utf-8", "cp1250", "iso-8859-2"]:
            try:
                text = payload.decode(enc)
                break
            except (UnicodeDecodeError, LookupError):
                continue
        else:
            return results

        delimiter = ";" if text.split("\n")[0].count(";") > text.split("\n")[0].count(",") else ","
        reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)

        for row_idx, row in enumerate(reader, 1):
            row_lower = {k.lower().strip(): v.strip() for k, v in row.items() if k and v}
            number = row_lower.get("numer") or row_lower.get("number") or row_lower.get("nr")
            contractor = row_lower.get("kontrahent") or row_lower.get("contractor_name") or row_lower.get("nazwa")
            nip = row_lower.get("nip") or row_lower.get("contractor_nip")
            gross = self._parse_amount(row_lower.get("brutto") or row_lower.get("amount_gross") or row_lower.get("kwota"))
            net = self._parse_amount(row_lower.get("netto") or row_lower.get("amount_net"))
            vat = self._parse_amount(row_lower.get("vat") or row_lower.get("amount_vat"))
            doc_date = self._parse_date(row_lower.get("data") or row_lower.get("date") or row_lower.get("document_date"))

            if number or gross or contractor:
                results.append(ImportResult(
                    doc_type="invoice",
                    number=number,
                    contractor_name=contractor,
                    contractor_nip=self._clean_nip(nip),
                    amount_net=net,
                    amount_vat=vat,
                    amount_gross=gross,
                    document_date=doc_date or (msg_date.date() if msg_date else None),
                    source="email",
                    source_id=f"email-csv-{filename}-row{row_idx}",
                    original_filename=filename,
                ))

        return results

    def _parse_xml_attachment(self, payload: bytes, filename: str,
                              from_addr: str, msg_date) -> List[ImportResult]:
        """Parse XML invoice (basic FA/KSeF format)."""
        import xml.etree.ElementTree as ET
        results = []

        try:
            text = payload.decode("utf-8")
        except UnicodeDecodeError:
            text = payload.decode("cp1250", errors="replace")

        try:
            root = ET.fromstring(text)
        except ET.ParseError:
            return results

        # Try to find invoice elements (FA namespace or generic)
        ns = {"fa": "http://crd.gov.pl/wzor/2023/06/29/12648/"}
        invoices = root.findall(".//fa:Fa", ns) or root.findall(".//Faktura") or [root]

        for inv in invoices:
            number = self._xml_text(inv, [".//fa:P_2", ".//Numer", ".//Number", ".//P_2"])
            contractor = self._xml_text(inv, [".//fa:Podmiot2//fa:Nazwa", ".//Kontrahent", ".//Nazwa", ".//NazwaNabywcy"])
            nip = self._xml_text(inv, [".//fa:Podmiot2//fa:NIP", ".//NIP", ".//NIPNabywcy"])
            gross = self._parse_amount(self._xml_text(inv, [".//fa:P_15", ".//Brutto", ".//KwotaBrutto"]))
            net = self._parse_amount(self._xml_text(inv, [".//fa:P_13_1", ".//Netto", ".//KwotaNetto"]))
            vat = self._parse_amount(self._xml_text(inv, [".//fa:P_14_1", ".//VAT", ".//KwotaVAT"]))
            doc_date_str = self._xml_text(inv, [".//fa:P_1", ".//Data", ".//DataWystawienia"])
            doc_date = self._parse_date(doc_date_str)

            if number or gross or contractor:
                results.append(ImportResult(
                    doc_type="invoice",
                    number=number,
                    contractor_name=contractor,
                    contractor_nip=self._clean_nip(nip),
                    amount_net=net,
                    amount_vat=vat,
                    amount_gross=gross,
                    document_date=doc_date or (msg_date.date() if msg_date else None),
                    source="email",
                    source_id=f"email-xml-{filename}",
                    original_filename=filename,
                ))

        return results

    def _parse_pdf_filename(self, filename: str, from_addr: str, msg_date) -> Optional[ImportResult]:
        """Extract basic info from PDF filename like 'FV_001_2026_OVH.pdf'."""
        name = filename.rsplit(".", 1)[0]
        # Try patterns: FV/001/2026, FV-001-2026, etc.
        fv_match = re.search(r"(FV|FA|FZ|Faktura)[_\-/]?(\d+)[_\-/]?(\d{2,4})?", name, re.IGNORECASE)
        number = fv_match.group(0).replace("_", "/") if fv_match else name

        return ImportResult(
            doc_type="invoice",
            number=number,
            contractor_name=self._extract_sender_name(from_addr),
            document_date=msg_date.date() if msg_date else None,
            source="email",
            source_id=f"email-pdf-{filename}",
            original_filename=filename,
        )

    def _parse_body(self, msg, subject: str, from_addr: str,
                    msg_date, msg_id: str) -> Optional[ImportResult]:
        """Try to extract invoice data from email body text."""
        body = ""
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                payload = part.get_payload(decode=True)
                if payload:
                    for enc in ["utf-8", "cp1250", "iso-8859-2"]:
                        try:
                            body = payload.decode(enc)
                            break
                        except (UnicodeDecodeError, LookupError):
                            continue

        if not body:
            return None

        # Look for invoice number patterns in body
        fv_match = re.search(r"(FV|FA|FZ|Faktura)\s*[:\-#]?\s*([A-Z0-9/\-]+)", body, re.IGNORECASE)
        amount_match = re.search(r"(brutto|do zapłaty|razem)[:\s]*([0-9\s,\.]+)\s*(PLN|zł)?", body, re.IGNORECASE)
        nip_match = re.search(r"NIP[:\s]*(\d[\d\s\-]{8,}\d)", body)

        if fv_match or amount_match:
            return ImportResult(
                doc_type="invoice",
                number=fv_match.group(0).strip() if fv_match else None,
                contractor_name=self._extract_sender_name(from_addr),
                contractor_nip=self._clean_nip(nip_match.group(1)) if nip_match else None,
                amount_gross=self._parse_amount(amount_match.group(2)) if amount_match else None,
                document_date=msg_date.date() if msg_date else None,
                source="email",
                source_id=f"email-body-{msg_id}",
                description=subject,
            )
        return None

    def test_connection(self) -> dict:
        host = self.config.get("host", "")
        port = int(self.config.get("port", 993))
        username = self.config.get("username", "")
        password = self.config.get("password", "")
        folder = self.config.get("folder", "INBOX")

        if not host:
            return {"ok": False, "message": "Brak adresu serwera IMAP (host)."}
        if not username:
            return {"ok": False, "message": "Brak nazwy użytkownika (username)."}

        try:
            if port == 993:
                mail = imaplib.IMAP4_SSL(host, port, timeout=10)
            else:
                mail = imaplib.IMAP4(host, port, timeout=10)

            if password:
                mail.login(username, password)
                status, data = mail.select(folder, readonly=True)
                if status == "OK":
                    msg_count = int(data[0])
                    mail.logout()
                    return {"ok": True, "message": f"Połączenie OK. Folder '{folder}' zawiera {msg_count} wiadomości."}
                else:
                    mail.logout()
                    return {"ok": False, "message": f"Połączenie OK, ale folder '{folder}' nie istnieje."}
            else:
                mail.logout()
                return {"ok": True, "message": f"Połączenie z serwerem {host}:{port} OK (brak hasła — nie zalogowano)."}

        except imaplib.IMAP4.error as e:
            return {"ok": False, "message": f"Błąd IMAP: {str(e)}"}
        except socket.timeout:
            return {"ok": False, "message": f"Timeout — serwer {host}:{port} nie odpowiada."}
        except socket.gaierror:
            return {"ok": False, "message": f"Nie można rozwiązać adresu: {host}"}
        except ConnectionRefusedError:
            return {"ok": False, "message": f"Połączenie odrzucone: {host}:{port}"}
        except Exception as e:
            return {"ok": False, "message": f"Błąd: {str(e)}"}

    # ── Helpers ──

    @staticmethod
    def _decode_header(val):
        if not val:
            return ""
        decoded_parts = email.header.decode_header(val)
        result = []
        for part, charset in decoded_parts:
            if isinstance(part, bytes):
                result.append(part.decode(charset or "utf-8", errors="replace"))
            else:
                result.append(part)
        return " ".join(result)

    @staticmethod
    def _extract_sender_name(from_addr: str) -> str:
        match = re.match(r'"?([^"<]+)"?\s*<', from_addr)
        return match.group(1).strip() if match else from_addr.split("@")[0]

    @staticmethod
    def _xml_text(elem, paths: list) -> Optional[str]:
        for p in paths:
            found = elem.find(p) if not p.startswith(".//fa:") else elem.find(p, {"fa": "http://crd.gov.pl/wzor/2023/06/29/12648/"})
            if found is not None and found.text:
                return found.text.strip()
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
        for fmt in ["%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%Y", "%Y/%m/%d"]:
            try:
                return datetime.strptime(str(val).strip(), fmt).date()
            except ValueError:
                continue
        return None

    @staticmethod
    def _clean_nip(nip) -> Optional[str]:
        if not nip:
            return None
        cleaned = re.sub(r"[\s\-\.]", "", str(nip))
        cleaned = re.sub(r"^PL", "", cleaned, flags=re.IGNORECASE)
        return cleaned[:10] if cleaned and cleaned.isdigit() else None
