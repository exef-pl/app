"""Helper functions for sources — mock generators, CSV parsing, connection tests."""
import re
from uuid import uuid4
from datetime import datetime as dt

from app.models.models import DataSource, Task, DocumentStatus


# ═══════════════════════════════════════════════════════════════════════════════
# CSV PARSING HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

CSV_COL_MAP = {
    'number': ['number', 'numer', 'nr', 'nr_dokumentu', 'numer_faktury', 'invoice_number'],
    'contractor_name': ['contractor_name', 'kontrahent', 'nazwa', 'nazwa_kontrahenta', 'dostawca', 'odbiorca', 'name'],
    'contractor_nip': ['contractor_nip', 'nip', 'nip_kontrahenta'],
    'amount_net': ['amount_net', 'netto', 'kwota_netto', 'net'],
    'amount_vat': ['amount_vat', 'vat', 'kwota_vat'],
    'amount_gross': ['amount_gross', 'brutto', 'kwota_brutto', 'kwota', 'gross', 'amount'],
    'document_date': ['document_date', 'data', 'date', 'data_dokumentu', 'data_faktury', 'data_wystawienia'],
    'doc_type': ['doc_type', 'typ', 'type', 'typ_dokumentu'],
    'description': ['description', 'opis'],
    'category': ['category', 'kategoria'],
    'currency': ['currency', 'waluta'],
}


def detect_delimiter(content: str) -> str:
    """Detect CSV delimiter (semicolon vs comma)."""
    first_line = content.split('\n')[0] if content else ''
    if first_line.count(';') > first_line.count(','):
        return ';'
    return ','


def map_csv_row(row: dict, col_map: dict) -> dict:
    """Map CSV row to document fields using flexible column names."""
    result = {}
    row_lower = {k.lower().strip(): v for k, v in row.items() if k}
    for field, aliases in col_map.items():
        for alias in aliases:
            if alias in row_lower and row_lower[alias]:
                result[field] = row_lower[alias].strip()
                break
    return result


def clean_nip(nip: str | None) -> str | None:
    """Clean NIP - remove separators."""
    if not nip:
        return None
    cleaned = re.sub(r'[\s\-\.]', '', nip)
    cleaned = re.sub(r'^PL', '', cleaned, flags=re.IGNORECASE)
    return cleaned[:10] if cleaned else None


def parse_amount(val: str | None) -> float | None:
    """Parse Polish amount format (1 234,56 or 1234.56)."""
    if not val:
        return None
    cleaned = re.sub(r'[^\d,.\-]', '', val)
    cleaned = cleaned.replace(',', '.')
    # Handle case where . is thousands separator: 1.234.56
    parts = cleaned.split('.')
    if len(parts) > 2:
        cleaned = ''.join(parts[:-1]) + '.' + parts[-1]
    try:
        return round(float(cleaned), 2)
    except ValueError:
        return None


def parse_date(val: str | None):
    """Parse Polish date formats."""
    if not val:
        return None
    for fmt in ['%Y-%m-%d', '%d-%m-%Y', '%d.%m.%Y', '%d/%m/%Y', '%Y/%m/%d']:
        try:
            return dt.strptime(val.strip(), fmt).date()
        except ValueError:
            continue
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# CONNECTION TEST HELPERS (legacy — adapters now handle test_connection)
# ═══════════════════════════════════════════════════════════════════════════════

def test_email_connection(config: dict) -> dict:
    """Test IMAP email connection."""
    import imaplib
    import socket

    host = config.get("host", "")
    port = int(config.get("port", 993))
    username = config.get("username", "")
    password = config.get("password", "")
    folder = config.get("folder", "INBOX")

    if not host:
        return {"ok": False, "message": "Brak adresu serwera IMAP (host)."}
    if not username:
        return {"ok": False, "message": "Brak nazwy użytkownika (username)."}

    try:
        # Try connecting to IMAP server
        if port == 993:
            mail = imaplib.IMAP4_SSL(host, port, timeout=10)
        else:
            mail = imaplib.IMAP4(host, port, timeout=10)

        # Try login if password provided
        if password:
            mail.login(username, password)
            # Try selecting folder
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


def test_ksef_connection(config: dict) -> dict:
    """Test KSeF connection (NIP validation + API ping)."""
    import urllib.request
    import urllib.error

    nip = config.get("nip", "")
    environment = config.get("environment", "test")

    if not nip:
        return {"ok": False, "message": "Brak NIP-u."}

    # Validate NIP format
    clean = re.sub(r'[\s\-]', '', nip)
    if len(clean) != 10 or not clean.isdigit():
        return {"ok": False, "message": f"Nieprawidłowy format NIP: '{nip}'. NIP powinien mieć 10 cyfr."}

    # NIP checksum validation
    weights = [6, 5, 7, 2, 3, 4, 5, 6, 7]
    checksum = sum(int(clean[i]) * weights[i] for i in range(9)) % 11
    if checksum != int(clean[9]):
        return {"ok": False, "message": f"NIP '{clean}' ma nieprawidłową sumę kontrolną."}

    # Try pinging KSeF API
    env_urls = {
        "test": "https://ksef-test.mf.gov.pl/api",
        "demo": "https://ksef-demo.mf.gov.pl/api",
        "prod": "https://ksef.mf.gov.pl/api",
    }
    base_url = env_urls.get(environment, env_urls["test"])

    try:
        req = urllib.request.Request(f"{base_url}/online/Session/Status/Credentials", method="GET")
        req.add_header("Accept", "application/json")
        with urllib.request.urlopen(req, timeout=10) as resp:
            return {"ok": True, "message": f"NIP {clean} prawidłowy. Serwer KSeF ({environment}) odpowiada (HTTP {resp.status})."}
    except urllib.error.HTTPError as e:
        return {"ok": True, "message": f"NIP {clean} prawidłowy. Serwer KSeF ({environment}) dostępny (HTTP {e.code})."}
    except urllib.error.URLError as e:
        return {"ok": False, "message": f"NIP {clean} prawidłowy, ale serwer KSeF ({environment}) niedostępny: {e.reason}"}
    except Exception as e:
        return {"ok": False, "message": f"NIP {clean} prawidłowy, ale błąd połączenia: {str(e)}"}


# ═══════════════════════════════════════════════════════════════════════════════
# MOCK DATA GENERATORS (to be replaced by real adapters later)
# ═══════════════════════════════════════════════════════════════════════════════

def generate_mock_import(source: DataSource, task: Task) -> list:
    """Generate mock documents for import demo."""
    import random
    from datetime import date, timedelta

    source_type_str = source.source_type.value if hasattr(source.source_type, 'value') else str(source.source_type)

    contractors = [
        ("OVH Sp. z o.o.", "5213003700", "Hosting serwera"),
        ("Google Ireland Ltd", None, "Google Workspace"),
        ("Hetzner Online GmbH", None, "Serwer VPS"),
        ("Allegro.pl Sp. z o.o.", "5272525995", "Materiały biurowe"),
        ("MediaMarkt Sp. z o.o.", "5213406938", "Sprzęt IT"),
        ("Shell Polska Sp. z o.o.", "5270008597", "Paliwo"),
        ("PGE Obrót S.A.", "6110202860", "Energia elektryczna"),
        ("Orange Polska S.A.", "5260250995", "Telefon i internet"),
        ("Comarch S.A.", "6770065406", "Licencja oprogramowania"),
        ("IKEA Retail Sp. z o.o.", "5262548458", "Wyposażenie biura"),
    ]

    num_docs = random.randint(3, 8)
    docs = []

    period_start = task.period_start or date.today().replace(day=1)
    period_end = task.period_end or date.today()

    for i in range(num_docs):
        contractor = random.choice(contractors)
        amount_net = round(random.uniform(50, 5000), 2)
        vat = round(amount_net * 0.23, 2)
        doc_date = period_start + timedelta(days=random.randint(0, max(0, (period_end - period_start).days)))

        doc_num_prefix = {"email": "FV", "ksef": "KSEF", "upload": "FV", "manual": "FV"}.get(source_type_str, "FV")

        docs.append({
            "doc_type": "invoice",
            "number": f"{doc_num_prefix}/{random.randint(1,999):03d}/{doc_date.month:02d}/{doc_date.year}",
            "contractor_name": contractor[0],
            "contractor_nip": contractor[1],
            "amount_net": amount_net,
            "amount_vat": vat,
            "amount_gross": round(amount_net + vat, 2),
            "currency": "PLN",
            "document_date": doc_date,
            "source": source_type_str,
            "source_id": f"{source_type_str}-{uuid4().hex[:8]}",
            "status": DocumentStatus.NEW,
        })

    return docs


def generate_mock_export(source: DataSource, docs: list, task: Task) -> tuple:
    """Generate mock export file content. Returns (content, filename)."""
    import csv
    import io

    source_type_str = source.source_type.value if hasattr(source.source_type, 'value') else str(source.source_type)
    timestamp = dt.utcnow().strftime("%Y%m%d_%H%M%S")

    if source_type_str in ("wfirma", "csv", "symfonia"):
        output = io.StringIO()
        writer = csv.writer(output, delimiter=';')
        writer.writerow(["Lp", "Data", "Numer", "Kontrahent", "NIP", "Netto", "VAT", "Brutto", "Kategoria"])
        for idx, doc in enumerate(docs, 1):
            meta = doc.document_metadata
            writer.writerow([
                idx,
                str(doc.document_date or ""),
                doc.number or "",
                doc.contractor_name or "",
                doc.contractor_nip or "",
                f"{doc.amount_net or 0:.2f}",
                f"{doc.amount_vat or 0:.2f}",
                f"{doc.amount_gross or 0:.2f}",
                meta.category if meta else "",
            ])
        content = output.getvalue()
        filename = f"export_{source_type_str}_{timestamp}.csv"
    else:
        # XML format
        entries = []
        for doc in docs:
            meta = doc.document_metadata
            entries.append(f"""    <Dokument>
        <Numer>{doc.number or ''}</Numer>
        <Data>{doc.document_date or ''}</Data>
        <Kontrahent>{doc.contractor_name or ''}</Kontrahent>
        <NIP>{doc.contractor_nip or ''}</NIP>
        <Netto>{doc.amount_net or 0:.2f}</Netto>
        <VAT>{doc.amount_vat or 0:.2f}</VAT>
        <Brutto>{doc.amount_gross or 0:.2f}</Brutto>
        <Kategoria>{meta.category if meta else ''}</Kategoria>
    </Dokument>""")
        content = f"""<?xml version="1.0" encoding="UTF-8"?>
<Eksport system="EXEF" data="{timestamp}">
    <Dokumenty>
{"".join(entries)}
    </Dokumenty>
</Eksport>"""
        filename = f"export_{source_type_str}_{timestamp}.xml"

    return content, filename
