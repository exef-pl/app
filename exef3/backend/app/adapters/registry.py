"""Adapter registry — maps source_type to import/export adapter classes."""

from app.adapters.import_email import EmailImportAdapter
from app.adapters.import_ksef import KsefImportAdapter
from app.adapters.import_bank import (
    BankGenericImportAdapter, BankINGImportAdapter, BankMBankImportAdapter,
    BankPKOImportAdapter, BankSantanderImportAdapter, BankPekaoImportAdapter,
)
from app.adapters.import_csv import CsvImportAdapter
from app.adapters.import_manual import ManualImportAdapter, UploadImportAdapter, WebhookImportAdapter

from app.adapters.export_wfirma import WfirmaExportAdapter
from app.adapters.export_jpk import JpkPkpirExportAdapter
from app.adapters.export_comarch import ComarchExportAdapter
from app.adapters.export_symfonia import SymfoniaExportAdapter
from app.adapters.export_enova import EnovaExportAdapter
from app.adapters.export_csv import CsvExportAdapter


IMPORT_ADAPTERS = {
    "email": EmailImportAdapter,
    "ksef": KsefImportAdapter,
    "csv": CsvImportAdapter,
    "upload": UploadImportAdapter,
    "manual": ManualImportAdapter,
    "webhook": WebhookImportAdapter,
    "bank": BankGenericImportAdapter,
    "bank_ing": BankINGImportAdapter,
    "bank_mbank": BankMBankImportAdapter,
    "bank_pko": BankPKOImportAdapter,
    "bank_santander": BankSantanderImportAdapter,
    "bank_pekao": BankPekaoImportAdapter,
}

EXPORT_ADAPTERS = {
    "wfirma": WfirmaExportAdapter,
    "jpk_pkpir": JpkPkpirExportAdapter,
    "comarch": ComarchExportAdapter,
    "symfonia": SymfoniaExportAdapter,
    "enova": EnovaExportAdapter,
    "csv": CsvExportAdapter,
}


def get_import_adapter(source_type: str):
    """Get import adapter class for source_type. Returns None if not found."""
    return IMPORT_ADAPTERS.get(source_type)


def get_export_adapter(source_type: str):
    """Get export adapter class for source_type. Returns None if not found."""
    return EXPORT_ADAPTERS.get(source_type)
