"""
Deterministic document ID generator — compatible with docid library.

Generates the same ID for the same document regardless of source format.
Algorithm: normalize fields → join with '|' → SHA256 → first 16 hex chars → DOC-{TYPE}-{HASH}
"""
import hashlib
import re
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional, Union


def normalize_nip(nip: str) -> str:
    """Normalize NIP to 10 digits without separators."""
    if not nip:
        return ""
    cleaned = re.sub(r'^[A-Z]{2}', '', nip.upper())
    cleaned = re.sub(r'[\s\-\.]', '', cleaned)
    return cleaned


def normalize_amount(amount: Union[str, float, Decimal, None]) -> str:
    """Normalize monetary amount to 2 decimal places."""
    if amount is None:
        return "0.00"
    if isinstance(amount, (int, float)):
        return f"{Decimal(str(amount)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)}"
    cleaned = str(amount).upper()
    cleaned = re.sub(r'[ZŁPLN\s]', '', cleaned)
    cleaned = cleaned.replace(',', '.')
    parts = cleaned.rsplit('.', 1)
    if len(parts) == 2:
        integer_part = re.sub(r'[\.\s]', '', parts[0])
        cleaned = f"{integer_part}.{parts[1]}"
    else:
        cleaned = re.sub(r'[\.\s]', '', cleaned)
    try:
        return str(Decimal(cleaned).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))
    except Exception:
        return "0.00"


def normalize_date(d: Union[str, date, datetime, None]) -> str:
    """Normalize date to ISO YYYY-MM-DD."""
    if d is None:
        return ""
    if isinstance(d, datetime):
        return d.strftime('%Y-%m-%d')
    if isinstance(d, date):
        return d.strftime('%Y-%m-%d')
    cleaned = str(d).strip()
    for fmt in ['%Y-%m-%d', '%d-%m-%Y', '%d.%m.%Y', '%d/%m/%Y', '%Y/%m/%d', '%Y%m%d']:
        try:
            return datetime.strptime(cleaned, fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    return cleaned


def normalize_invoice_number(number: str) -> str:
    """Normalize invoice number."""
    if not number:
        return ""
    normalized = number.upper().strip()
    normalized = re.sub(r'[\s\-_]+', '/', normalized)
    normalized = re.sub(r'/+', '/', normalized)
    return normalized.strip('/')


def generate_doc_id(
    contractor_nip: Optional[str] = None,
    number: Optional[str] = None,
    document_date: Optional[Union[str, date]] = None,
    amount_gross: Optional[Union[float, Decimal]] = None,
    doc_type: str = "invoice",
) -> Optional[str]:
    """
    Generate a deterministic document ID compatible with docid library.

    Returns None if insufficient data to generate a meaningful ID.
    Format: DOC-{TYPE}-{HASH16}
    """
    type_codes = {
        "invoice": "FV",
        "receipt": "PAR",
        "contract": "UMO",
        "correction": "KOR",
        "proforma": "PRO",
        "other": "DOC",
    }
    type_code = type_codes.get(doc_type, "DOC")

    nip = normalize_nip(contractor_nip or "")
    num = normalize_invoice_number(number or "")
    dt = normalize_date(document_date)
    amt = normalize_amount(amount_gross)

    # Need at least 2 meaningful fields to generate a useful ID
    fields = [nip, num, dt, amt]
    meaningful = sum(1 for f in fields if f and f != "0.00" and f != "")
    if meaningful < 2:
        return None

    canonical = "|".join(fields)
    hash_bytes = hashlib.sha256(canonical.encode('utf-8')).digest()
    hash_hex = hash_bytes.hex()[:16].upper()

    return f"DOC-{type_code}-{hash_hex}"
