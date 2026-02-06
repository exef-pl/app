"""JPK_PKPIR XML export adapter — generates proper JPK_PKPIR XML for Polish tax office."""
from datetime import datetime, date
from xml.sax.saxutils import escape

from app.adapters.base import BaseExportAdapter, ExportResult


class JpkPkpirExportAdapter(BaseExportAdapter):
    """Export documents to JPK_PKPIR (XML) format.

    Generates Jednolity Plik Kontrolny — Podatkowa Księga Przychodów i Rozchodów
    conforming to the JPK_PKPIR(3) schema structure.
    """

    def export(self, documents: list, task_name: str = "") -> ExportResult:
        nip = self.config.get("nip", "0000000000")
        company_name = self.config.get("company_name", "Firma")
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")

        # Determine period from documents
        dates = [d.document_date for d in documents if d.document_date]
        date_from = min(dates) if dates else date.today().replace(day=1)
        date_to = max(dates) if dates else date.today()

        entries_xml = []
        total_net = 0.0
        total_vat = 0.0
        total_gross = 0.0

        for idx, doc in enumerate(documents, 1):
            meta = doc.document_metadata
            net = doc.amount_net or 0
            vat = doc.amount_vat or 0
            gross = doc.amount_gross or 0
            total_net += net
            total_vat += vat
            total_gross += gross

            # Determine PKPIR column (simplified):
            # kolumna 10 = zakup towarów, kolumna 13 = pozostałe wydatki
            kolumna = "13"  # default: pozostałe wydatki
            category = (meta.category if meta else "") or ""
            if any(k in category.lower() for k in ["towar", "materiał", "material", "zakup"]):
                kolumna = "10"

            doc_date_str = doc.document_date.strftime("%Y-%m-%d") if doc.document_date else ""

            entries_xml.append(f"""      <PKPIRWiersz>
        <K_1>{idx}</K_1>
        <K_2>{esc(doc_date_str)}</K_2>
        <K_3>{esc(doc.number or '')}</K_3>
        <K_4>{esc(doc.contractor_name or '')}</K_4>
        <K_5>{esc(doc.contractor_nip or '')}</K_5>
        <K_6>{esc(category)}</K_6>
        <K_{kolumna}>{net:.2f}</K_{kolumna}>
        <K_14>{vat:.2f}</K_14>
        <K_15>{gross:.2f}</K_15>
        <K_16>{esc(meta.description if meta and meta.description else '')}</K_16>
      </PKPIRWiersz>""")

        xml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<JPK xmlns="http://jpk.mf.gov.pl/wzor/2022/02/17/02171/"
     xmlns:etd="http://crd.gov.pl/xml/schematy/dziedzinowe/mf/2022/01/05/eD/DefinicjeTypy/">
  <Naglowek>
    <KodFormularza kodSystemowy="JPK_PKPIR (3)" wersjaSchemy="3-0">JPK_PKPIR</KodFormularza>
    <WariantFormularza>3</WariantFormularza>
    <CelZlozenia>1</CelZlozenia>
    <DataWytworzeniaJPK>{datetime.utcnow().isoformat()}Z</DataWytworzeniaJPK>
    <DataOd>{date_from.strftime('%Y-%m-%d')}</DataOd>
    <DataDo>{date_to.strftime('%Y-%m-%d')}</DataDo>
    <NazwaSystemu>EXEF</NazwaSystemu>
  </Naglowek>
  <Podmiot1>
    <etd:NIP>{esc(nip)}</etd:NIP>
    <etd:PelnaNazwa>{esc(company_name)}</etd:PelnaNazwa>
  </Podmiot1>
  <PKPIRInfo>
    <LiczbaWierszy>{len(documents)}</LiczbaWierszy>
    <SumaKol13>{total_net:.2f}</SumaKol13>
    <SumaKol14>{total_vat:.2f}</SumaKol14>
    <SumaKol15>{total_gross:.2f}</SumaKol15>
  </PKPIRInfo>
  <PKPIRWiersze>
{chr(10).join(entries_xml)}
  </PKPIRWiersze>
</JPK>"""

        filename = f"JPK_PKPIR_{date_from.strftime('%Y%m%d')}_{date_to.strftime('%Y%m%d')}.xml"

        return ExportResult(
            content=xml_content,
            filename=filename,
            format="xml",
            docs_exported=len(documents),
        )

    def test_connection(self) -> dict:
        nip = self.config.get("nip", "")
        if not nip:
            return {"ok": False, "message": "Brak NIP firmy — wymagany do generowania JPK."}
        company = self.config.get("company_name", "")
        if not company:
            return {"ok": False, "message": "Brak nazwy firmy — wymagana do generowania JPK."}
        return {"ok": True, "message": f"Konfiguracja JPK_PKPIR poprawna: {company} (NIP: {nip})."}


def esc(val: str) -> str:
    """XML-escape a string."""
    return escape(str(val)) if val else ""
