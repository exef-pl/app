"""enova365 XML export adapter."""
from datetime import datetime
from xml.sax.saxutils import escape

from app.adapters.base import BaseExportAdapter, ExportResult


class EnovaExportAdapter(BaseExportAdapter):
    """Export documents to enova365 XML import format."""

    def export(self, documents: list, task_name: str = "") -> ExportResult:
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

        entries = []
        for idx, doc in enumerate(documents, 1):
            meta = doc.document_metadata
            doc_date = doc.document_date.strftime("%Y-%m-%d") if doc.document_date else ""

            entries.append(f"""    <DokumentZakupu lp="{idx}">
      <Numer>{esc(doc.number or '')}</Numer>
      <DataWystawienia>{esc(doc_date)}</DataWystawienia>
      <DataWplywu>{esc(doc_date)}</DataWplywu>
      <Kontrahent>
        <Nazwa>{esc(doc.contractor_name or '')}</Nazwa>
        <NIP>{esc(doc.contractor_nip or '')}</NIP>
      </Kontrahent>
      <Pozycje>
        <Pozycja>
          <Opis>{esc(meta.category if meta else '')}</Opis>
          <Netto>{doc.amount_net or 0:.2f}</Netto>
          <VAT>{doc.amount_vat or 0:.2f}</VAT>
          <Brutto>{doc.amount_gross or 0:.2f}</Brutto>
          <StawkaVAT>{self._vat_rate(doc)}</StawkaVAT>
        </Pozycja>
      </Pozycje>
      <Uwagi>{esc(meta.description if meta and meta.description else '')}</Uwagi>
    </DokumentZakupu>""")

        xml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<ImportDokumentow xmlns="http://www.enova.pl/schema/import"
                  wersja="365"
                  data="{timestamp}"
                  system="EXEF">
  <DokumentyZakupu>
{chr(10).join(entries)}
  </DokumentyZakupu>
</ImportDokumentow>"""

        filename = f"enova365_import_{timestamp}.xml"

        return ExportResult(
            content=xml_content,
            filename=filename,
            format="xml",
            docs_exported=len(documents),
        )

    def test_connection(self) -> dict:
        return {"ok": True, "message": "Eksport enova365 generuje plik XML do importu — nie wymaga połączenia."}

    @staticmethod
    def _vat_rate(doc) -> str:
        if doc.amount_net and doc.amount_vat and doc.amount_net > 0:
            return f"{round(doc.amount_vat / doc.amount_net * 100)}%"
        return "23%"


def esc(val: str) -> str:
    return escape(str(val)) if val else ""
