"""Mock KSeF API server — returns test invoices for import testing."""
from fastapi import FastAPI, Query
from typing import Optional
from datetime import date

app = FastAPI(title="Mock KSeF API", version="1.0")

# Test invoices database
TEST_INVOICES = [
    {
        "id": "ksef-2026-001",
        "ksefReferenceNumber": "KSEF-2026-001-0001-AAAA",
        "invoiceNumber": "KSEF/001/01/2026",
        "issuerName": "Comarch S.A.",
        "issuerNip": "6770065406",
        "invoiceDate": "2026-01-18",
        "netAmount": 4065.04,
        "vatAmount": 934.96,
        "grossAmount": 5000.00,
        "currency": "PLN",
    },
    {
        "id": "ksef-2026-002",
        "ksefReferenceNumber": "KSEF-2026-002-0001-BBBB",
        "invoiceNumber": "KSEF/002/01/2026",
        "issuerName": "IKEA Retail Sp. z o.o.",
        "issuerNip": "5262548458",
        "invoiceDate": "2026-01-20",
        "netAmount": 2439.02,
        "vatAmount": 560.98,
        "grossAmount": 3000.00,
        "currency": "PLN",
    },
    {
        "id": "ksef-2026-003",
        "ksefReferenceNumber": "KSEF-2026-003-0001-CCCC",
        "invoiceNumber": "KSEF/003/01/2026",
        "issuerName": "MediaMarkt Sp. z o.o.",
        "issuerNip": "5213406938",
        "invoiceDate": "2026-01-22",
        "netAmount": 1626.02,
        "vatAmount": 373.98,
        "grossAmount": 2000.00,
        "currency": "PLN",
    },
    {
        "id": "ksef-2026-004",
        "ksefReferenceNumber": "KSEF-2026-004-0001-DDDD",
        "invoiceNumber": "KSEF/004/02/2026",
        "issuerName": "Allegro.pl Sp. z o.o.",
        "issuerNip": "5272525995",
        "invoiceDate": "2026-02-05",
        "netAmount": 813.01,
        "vatAmount": 186.99,
        "grossAmount": 1000.00,
        "currency": "PLN",
    },
    {
        "id": "ksef-2026-005",
        "ksefReferenceNumber": "KSEF-2026-005-0001-EEEE",
        "invoiceNumber": "KSEF/005/02/2026",
        "issuerName": "Shell Polska Sp. z o.o.",
        "issuerNip": "5270008597",
        "invoiceDate": "2026-02-10",
        "netAmount": 371.54,
        "vatAmount": 85.46,
        "grossAmount": 457.00,
        "currency": "PLN",
    },
]


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "mock-ksef", "version": "1.0"}


@app.get("/api/invoices")
def get_invoices(
    nip: Optional[str] = None,
    dateFrom: Optional[str] = None,
    dateTo: Optional[str] = None,
):
    """Return test invoices, optionally filtered by date range."""
    results = TEST_INVOICES

    if dateFrom:
        try:
            d = date.fromisoformat(dateFrom)
            results = [inv for inv in results if date.fromisoformat(inv["invoiceDate"]) >= d]
        except ValueError:
            pass

    if dateTo:
        try:
            d = date.fromisoformat(dateTo)
            results = [inv for inv in results if date.fromisoformat(inv["invoiceDate"]) <= d]
        except ValueError:
            pass

    return {"invoices": results, "total": len(results)}


@app.get("/api/invoices/{invoice_id}")
def get_invoice(invoice_id: str):
    """Return a single test invoice by ID."""
    for inv in TEST_INVOICES:
        if inv["id"] == invoice_id:
            return inv
    return {"error": "Invoice not found"}, 404


@app.get("/api/online/Session/Status/Credentials")
def session_status():
    """KSeF session status endpoint (used by test_connection)."""
    return {"status": "ok", "timestamp": "2026-01-01T00:00:00Z"}
