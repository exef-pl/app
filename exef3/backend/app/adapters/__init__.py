"""
Import/Export adapters — real implementations for all source types.

Each adapter handles one source_type and provides:
- ImportAdapter: pull documents from external source → list of doc dicts
- ExportAdapter: push documents to external target → file content or API call
"""
from app.adapters.registry import get_import_adapter, get_export_adapter

__all__ = ["get_import_adapter", "get_export_adapter"]
