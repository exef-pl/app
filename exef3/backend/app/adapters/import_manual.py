"""Manual/Upload/Webhook import adapters — simple pass-through adapters."""
from datetime import date
from typing import List, Optional

from app.adapters.base import BaseImportAdapter, ImportResult


class ManualImportAdapter(BaseImportAdapter):
    """Manual document entry — no external source, documents added via UI form."""

    def fetch(self, period_start: Optional[date] = None,
              period_end: Optional[date] = None) -> List[ImportResult]:
        # Manual adapter doesn't fetch — documents are created via API
        return []

    def test_connection(self) -> dict:
        return {"ok": True, "message": "Ręczne dodawanie nie wymaga połączenia."}


class UploadImportAdapter(BaseImportAdapter):
    """File upload import — files uploaded via UI, parsed server-side."""

    def fetch(self, period_start: Optional[date] = None,
              period_end: Optional[date] = None) -> List[ImportResult]:
        # Upload adapter doesn't fetch — files are uploaded via /flow/upload-csv
        return []

    def test_connection(self) -> dict:
        return {"ok": True, "message": "Upload plików jest zawsze dostępny."}


class WebhookImportAdapter(BaseImportAdapter):
    """Webhook import — receives documents via HTTP POST from external systems."""

    def fetch(self, period_start: Optional[date] = None,
              period_end: Optional[date] = None) -> List[ImportResult]:
        # Webhook adapter is passive — it receives data via POST endpoint
        return []

    def test_connection(self) -> dict:
        url = self.config.get("url", "")
        if not url:
            return {"ok": True, "message": "Webhook URL nie skonfigurowany — dokumenty przyjmowane na endpoincie wewnętrznym."}
        return {"ok": True, "message": f"Webhook skonfigurowany: {url}"}
