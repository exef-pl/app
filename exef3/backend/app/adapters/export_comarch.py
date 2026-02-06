"""Comarch Optima XML export adapter."""
from datetime import datetime
from xml.sax.saxutils import escape

from app.adapters.base import BaseExportAdapter, ExportResult


class ComarchExportAdapter(BaseExportAdapter):
    """Export documents to Comarch Optima XML format.

    Generates XML compatible with Comarch ERP Optima import.
    """

    def export(self, documents: list, task_name: str = "") -> ExportResult:
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

        entries = []
        for doc in documents:
            meta = doc.document_metadata
            doc_date = doc.document_date.strftime("%Y-%m-%d") if doc.document_date else ""
            vat_rate = "23"
            if doc.amount_net and doc.amount_vat and doc.amount_net > 0:
                vat_rate = str(round(doc.amount_vat / doc.amount_net * 100))

            entries.append(f"""    <REJESTR_ZAKUPOW_VAT>
      <MODUL>Rejestry VAT</MODUL>
      <TYP>Zakup</TYP>
      <REJESTR>ZAKUP</REJESTR>
      <DATA_WYSTAWIENIA>{esc(doc_date)}</DATA_WYSTAWIENIA>
      <DATA_ZAKUPU>{esc(doc_date)}</DATA_ZAKUPU>
      <NUMER_OBCY>{esc(doc.number or '')}</NUMER_OBCY>
      <PODMIOT_TYP>Kontrahent</PODMIOT_TYP>
      <PODMIOT_KOD>{esc(doc.contractor_nip or doc.contractor_name or '')}</PODMIOT_KOD>
      <PODMIOT_NAZWA1>{esc(doc.contractor_name or '')}</PODMIOT_NAZWA1>
      <PODMIOT_NIP>{esc(doc.contractor_nip or '')}</PODMIOT_NIP>
      <KATEGORIA>{esc(meta.category if meta else '')}</KATEGORIA>
      <OPIS>{esc(meta.description if meta and meta.description else '')}</OPIS>
      <PLATNOSC_TYP>przelew</PLATNOSC_TYP>
      <PLATNOSC_TERMIN>{esc(doc_date)}</PLATNOSC_TERMIN>
      <ELEMENTY>
        <ELEMENT>
          <STAWKA_VAT>{vat_rate}</STAWKA_VAT>
          <NETTO>{doc.amount_net or 0:.2f}</NETTO>
          <VAT>{doc.amount_vat or 0:.2f}</VAT>
          <BRUTTO>{doc.amount_gross or 0:.2f}</BRUTTO>
          <KOLUMNA_PKPIR>Inne</KOLUMNA_PKPIR>
        </ELEMENT>
      </ELEMENTY>
    </REJESTR_ZAKUPOW_VAT>""")

        xml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<REJESTRY_ZAKUPOW_VAT xmlns="http://www.comarch.pl/cdn/optima/offline"
                       wersja="2.0"
                       generacja="{timestamp}"
                       producent="EXEF">
{chr(10).join(entries)}
</REJESTRY_ZAKUPOW_VAT>"""

        filename = f"comarch_optima_import_{timestamp}.xml"

        return ExportResult(
            content=xml_content,
            filename=filename,
            format="xml",
            docs_exported=len(documents),
        )

    def test_connection(self) -> dict:
        return {"ok": True, "message": "Eksport Comarch Optima generuje plik XML do importu — nie wymaga połączenia."}


def esc(val: str) -> str:
    return escape(str(val)) if val else ""
