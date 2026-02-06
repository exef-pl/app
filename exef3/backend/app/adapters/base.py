"""Base classes for import/export adapters."""
from abc import ABC, abstractmethod
from typing import List, Optional
from datetime import date


class ImportResult:
    """Result of a single document import."""
    def __init__(self, doc_type="invoice", number=None, contractor_name=None,
                 contractor_nip=None, amount_net=None, amount_vat=None,
                 amount_gross=None, currency="PLN", document_date=None,
                 source="", source_id="", description=None, category=None,
                 original_filename=None):
        self.doc_type = doc_type
        self.number = number
        self.contractor_name = contractor_name
        self.contractor_nip = contractor_nip
        self.amount_net = amount_net
        self.amount_vat = amount_vat
        self.amount_gross = amount_gross
        self.currency = currency
        self.document_date = document_date
        self.source = source
        self.source_id = source_id
        self.description = description
        self.category = category
        self.original_filename = original_filename

    def to_dict(self):
        return {k: v for k, v in self.__dict__.items() if v is not None}


class ExportResult:
    """Result of an export operation."""
    def __init__(self, content: str, filename: str, format: str,
                 docs_exported: int = 0, encoding: str = "utf-8"):
        self.content = content
        self.filename = filename
        self.format = format
        self.docs_exported = docs_exported
        self.encoding = encoding


class BaseImportAdapter(ABC):
    """Base class for import adapters."""

    def __init__(self, config: dict, source_name: str = ""):
        self.config = config or {}
        self.source_name = source_name

    @abstractmethod
    def fetch(self, period_start: Optional[date] = None,
              period_end: Optional[date] = None) -> List[ImportResult]:
        """Fetch documents from the source. Returns list of ImportResult."""
        ...

    def test_connection(self) -> dict:
        """Test connection to the source. Returns {ok: bool, message: str}."""
        return {"ok": True, "message": "Test nie zaimplementowany dla tego typu źródła."}


class BaseExportAdapter(ABC):
    """Base class for export adapters."""

    def __init__(self, config: dict, source_name: str = ""):
        self.config = config or {}
        self.source_name = source_name

    @abstractmethod
    def export(self, documents: list, task_name: str = "") -> ExportResult:
        """Export documents. Returns ExportResult with file content."""
        ...

    def test_connection(self) -> dict:
        """Test connection to the export target."""
        return {"ok": True, "message": "Test nie zaimplementowany dla tego typu celu."}
