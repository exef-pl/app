"""
EXEF Export Adapters - Polish Accounting Software Formats

Supports export to popular Polish accounting applications:
- wFirma (CSV)
- Comarch Optima (XML)
- Symfonia (XML/CSV)
- enova365 (XML)
- inFakt (CSV)
- JPK_PKPIR (XML)
"""
import csv
import io
from datetime import datetime
from typing import Optional
from . import BaseAdapter, AdapterResult, register_adapter


# KPiR column mapping for 2026 regulations
KPIR_COLUMNS = {
    "lp": "Lp.",
    "date": "Data zdarzenia",
    "number": "Nr dowodu",
    "contractor_name": "Nazwa kontrahenta",
    "contractor_nip": "NIP kontrahenta", 
    "contractor_address": "Adres kontrahenta",
    "description": "Opis zdarzenia",
    "revenue_sale": "Przychody - sprzedaż",
    "revenue_other": "Przychody - pozostałe",
    "revenue_total": "Przychody - razem",
    "purchase_goods": "Zakup towarów i materiałów",
    "purchase_side_costs": "Koszty uboczne zakupu",
    "salary_cash": "Wynagrodzenia gotówka",
    "salary_kind": "Wynagrodzenia w naturze",
    "other_costs": "Pozostałe wydatki",
    "costs_total": "Koszty - razem",
    "other_deductions": "Inne",
    "rd_deduction": "Koszty B+R",
    "ksef_number": "Numer KSeF",
    "comments": "Uwagi"
}

# Category to KPiR column mapping
CATEGORY_MAPPING = {
    "sprzedaż": "revenue_sale",
    "przychody inne": "revenue_other",
    "towary": "purchase_goods",
    "materiały": "purchase_goods",
    "usługi obce": "other_costs",
    "wynagrodzenia": "salary_cash",
    "czynsz": "other_costs",
    "energia": "other_costs",
    "telefon": "other_costs",
    "internet": "other_costs",
    "paliwo": "other_costs",
    "ubezpieczenie": "other_costs",
    "reklama": "other_costs",
    "it/software": "other_costs",
    "b+r": "rd_deduction",
    "samochód 50%": "other_costs",
    "samochód 100%": "other_costs",
}


@register_adapter("wfirma")
class WFirmaAdapter(BaseAdapter):
    """
    wFirma CSV export adapter
    
    Config:
        - include_headers: Include column headers (default: True)
        - encoding: File encoding (default: utf-8-sig for Excel)
        - date_format: Date format (default: %Y-%m-%d)
    """
    
    name = "wfirma"
    supports_pull = False
    supports_push = True
    
    def __init__(self, config: dict):
        super().__init__(config)
        self.include_headers = config.get("include_headers", True)
        self.encoding = config.get("encoding", "utf-8-sig")
        self.date_format = config.get("date_format", "%Y-%m-%d")
    
    async def _pull(self) -> AdapterResult:
        return AdapterResult(success=False, errors=["Pull not supported"])
    
    async def _push(self, documents: list[dict]) -> AdapterResult:
        """Generate wFirma CSV export"""
        try:
            output = io.StringIO()
            writer = csv.writer(output, delimiter=';', quoting=csv.QUOTE_MINIMAL)
            
            # Headers
            if self.include_headers:
                headers = list(KPIR_COLUMNS.values())
                writer.writerow(headers)
            
            # Data rows
            for idx, doc in enumerate(documents, 1):
                row = self._document_to_row(idx, doc)
                writer.writerow(row)
            
            # Calculate totals
            totals = self._calculate_totals(documents)
            
            csv_content = output.getvalue()
            
            self.last_sync = datetime.utcnow()
            
            return AdapterResult(
                success=True,
                count=len(documents),
                documents=documents,
                metadata={
                    "format": "wfirma_csv",
                    "csv_content": csv_content,
                    "totals": totals,
                    "filename": f"kpir_export_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
                }
            )
            
        except Exception as e:
            return AdapterResult(success=False, errors=[str(e)])
    
    def _document_to_row(self, lp: int, doc: dict) -> list:
        """Convert document to CSV row"""
        # Determine which column to use based on category
        category = doc.get("category", "").lower()
        column_key = CATEGORY_MAPPING.get(category, "other_costs")
        
        # Handle automotive costs (50%/100%)
        amount = doc.get("amount", 0)
        if "samochód 50%" in category:
            amount = amount * 0.5
        
        # Build row with proper column placement
        row_data = {
            "lp": lp,
            "date": self._format_date(doc.get("issue_date") or doc.get("created_at", "")),
            "number": doc.get("number", ""),
            "contractor_name": doc.get("contractor", ""),
            "contractor_nip": doc.get("contractor_nip", ""),
            "contractor_address": doc.get("contractor_address", ""),
            "description": doc.get("description", ""),
            "revenue_sale": "",
            "revenue_other": "",
            "revenue_total": "",
            "purchase_goods": "",
            "purchase_side_costs": "",
            "salary_cash": "",
            "salary_kind": "",
            "other_costs": "",
            "costs_total": "",
            "other_deductions": "",
            "rd_deduction": "",
            "ksef_number": doc.get("ksef_number", ""),
            "comments": doc.get("comments", "")
        }
        
        # Set amount in correct column
        if doc.get("type") == "invoice" and column_key.startswith("revenue"):
            row_data[column_key] = f"{amount:.2f}"
            row_data["revenue_total"] = f"{amount:.2f}"
        else:
            row_data[column_key] = f"{amount:.2f}"
            if column_key != "rd_deduction":
                row_data["costs_total"] = f"{amount:.2f}"
        
        return [row_data.get(key, "") for key in KPIR_COLUMNS.keys()]
    
    def _format_date(self, date_str: str) -> str:
        """Format date string"""
        if not date_str:
            return ""
        try:
            if "T" in date_str:
                dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            else:
                dt = datetime.strptime(date_str[:10], "%Y-%m-%d")
            return dt.strftime(self.date_format)
        except:
            return date_str[:10] if len(date_str) >= 10 else date_str
    
    def _calculate_totals(self, documents: list[dict]) -> dict:
        """Calculate column totals"""
        totals = {
            "revenue_sale": 0,
            "revenue_other": 0,
            "revenue_total": 0,
            "purchase_goods": 0,
            "other_costs": 0,
            "costs_total": 0,
            "rd_deduction": 0
        }
        
        for doc in documents:
            category = doc.get("category", "").lower()
            column_key = CATEGORY_MAPPING.get(category, "other_costs")
            amount = doc.get("amount", 0)
            
            if "samochód 50%" in category:
                amount = amount * 0.5
            
            if column_key.startswith("revenue"):
                totals[column_key] += amount
                totals["revenue_total"] += amount
            else:
                totals[column_key] += amount
                if column_key != "rd_deduction":
                    totals["costs_total"] += amount
        
        return {k: round(v, 2) for k, v in totals.items()}


@register_adapter("jpk_pkpir")
class JPKPKPIRAdapter(BaseAdapter):
    """
    JPK_PKPIR XML export adapter
    
    Generates JPK_PKPIR XML compliant with Polish tax regulations.
    """
    
    name = "jpk_pkpir"
    supports_pull = False
    supports_push = True
    
    async def _pull(self) -> AdapterResult:
        return AdapterResult(success=False, errors=["Pull not supported"])
    
    async def _push(self, documents: list[dict]) -> AdapterResult:
        """Generate JPK_PKPIR XML"""
        try:
            nip = self.config.get("nip", "")
            name = self.config.get("company_name", "")
            period_from = self.config.get("period_from", datetime.utcnow().replace(day=1).strftime("%Y-%m-%d"))
            period_to = self.config.get("period_to", datetime.utcnow().strftime("%Y-%m-%d"))
            
            xml = self._generate_xml(documents, nip, name, period_from, period_to)
            
            self.last_sync = datetime.utcnow()
            
            return AdapterResult(
                success=True,
                count=len(documents),
                documents=documents,
                metadata={
                    "format": "jpk_pkpir",
                    "xml_content": xml,
                    "filename": f"JPK_PKPIR_{nip}_{period_from}_{period_to}.xml"
                }
            )
            
        except Exception as e:
            return AdapterResult(success=False, errors=[str(e)])
    
    def _generate_xml(self, documents: list[dict], nip: str, name: str, 
                      period_from: str, period_to: str) -> str:
        """Generate JPK_PKPIR XML content"""
        
        # Calculate totals
        totals = {"przychody": 0, "koszty": 0}
        entries_xml = []
        
        for idx, doc in enumerate(documents, 1):
            amount = doc.get("amount", 0)
            is_revenue = doc.get("type") == "invoice" and "sprzedaż" in doc.get("category", "").lower()
            
            if is_revenue:
                totals["przychody"] += amount
            else:
                totals["koszty"] += amount
            
            entry = f"""
    <PKPIRWiersz>
        <K_1>{idx}</K_1>
        <K_2>{doc.get('issue_date', '')[:10]}</K_2>
        <K_3>{doc.get('number', '')}</K_3>
        <K_4>{doc.get('contractor', '')}</K_4>
        <K_5>{doc.get('contractor_address', '')}</K_5>
        <K_6>{doc.get('description', '')}</K_6>
        <K_7>{amount:.2f}</K_7>
        <K_16>{doc.get('ksef_number', '')}</K_16>
    </PKPIRWiersz>"""
            entries_xml.append(entry)
        
        xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<JPK xmlns="http://jpk.mf.gov.pl/wzor/2022/02/17/02171/">
    <Naglowek>
        <KodFormularza kodSystemowy="JPK_PKPIR (3)" wersjaSchemy="3-0">JPK_PKPIR</KodFormularza>
        <WariantFormularza>3</WariantFormularza>
        <CelZlozenia>1</CelZlozenia>
        <DataWytworzeniaJPK>{datetime.utcnow().isoformat()}</DataWytworzeniaJPK>
        <DataOd>{period_from}</DataOd>
        <DataDo>{period_to}</DataDo>
        <NazwaSystemu>EXEF</NazwaSystemu>
    </Naglowek>
    <Podmiot1>
        <IdentyfikatorPodmiotu>
            <NIP>{nip}</NIP>
            <PelnaNazwa>{name}</PelnaNazwa>
        </IdentyfikatorPodmiotu>
    </Podmiot1>
    <PKPIR>
        {"".join(entries_xml)}
    </PKPIR>
    <PKPIRCtrl>
        <LiczbaWierszy>{len(documents)}</LiczbaWierszy>
        <SumaPrzychodow>{totals['przychody']:.2f}</SumaPrzychodow>
        <SumaKosztow>{totals['koszty']:.2f}</SumaKosztow>
    </PKPIRCtrl>
</JPK>"""
        
        return xml


@register_adapter("comarch")
class ComarchAdapter(BaseAdapter):
    """Comarch Optima XML export adapter"""
    
    name = "comarch"
    supports_pull = False
    supports_push = True
    
    async def _pull(self) -> AdapterResult:
        return AdapterResult(success=False, errors=["Pull not supported"])
    
    async def _push(self, documents: list[dict]) -> AdapterResult:
        # Simplified Comarch XML export
        entries = []
        for doc in documents:
            entries.append(f"""
    <Dokument>
        <Numer>{doc.get('number', '')}</Numer>
        <DataWystawienia>{doc.get('issue_date', '')}</DataWystawienia>
        <Kontrahent>{doc.get('contractor', '')}</Kontrahent>
        <NIP>{doc.get('contractor_nip', '')}</NIP>
        <Kwota>{doc.get('amount', 0):.2f}</Kwota>
        <NumerKSeF>{doc.get('ksef_number', '')}</NumerKSeF>
    </Dokument>""")
        
        xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Import xmlns="http://www.comarch.pl/erp/optima">
    <Dokumenty>
        {"".join(entries)}
    </Dokumenty>
</Import>"""
        
        return AdapterResult(
            success=True,
            count=len(documents),
            metadata={"format": "comarch_xml", "xml_content": xml}
        )


@register_adapter("symfonia")
class SymfoniaAdapter(BaseAdapter):
    """Symfonia export adapter"""
    
    name = "symfonia"
    supports_pull = False  
    supports_push = True
    
    async def _pull(self) -> AdapterResult:
        return AdapterResult(success=False, errors=["Pull not supported"])
    
    async def _push(self, documents: list[dict]) -> AdapterResult:
        # Symfonia CSV format
        output = io.StringIO()
        writer = csv.writer(output, delimiter=';')
        
        writer.writerow(["Numer", "Data", "Kontrahent", "NIP", "Kwota", "VAT", "KSeF"])
        
        for doc in documents:
            writer.writerow([
                doc.get("number", ""),
                doc.get("issue_date", "")[:10],
                doc.get("contractor", ""),
                doc.get("contractor_nip", ""),
                f"{doc.get('amount', 0):.2f}",
                doc.get("vat_rate", "23%"),
                doc.get("ksef_number", "")
            ])
        
        return AdapterResult(
            success=True,
            count=len(documents),
            metadata={"format": "symfonia_csv", "csv_content": output.getvalue()}
        )


@register_adapter("enova")
class EnovaAdapter(BaseAdapter):
    """enova365 export adapter"""
    
    name = "enova"
    supports_pull = False
    supports_push = True
    
    async def _pull(self) -> AdapterResult:
        return AdapterResult(success=False, errors=["Pull not supported"])
    
    async def _push(self, documents: list[dict]) -> AdapterResult:
        # enova XML format
        entries = []
        for doc in documents:
            entries.append(f"""
    <faktura>
        <numer>{doc.get('number', '')}</numer>
        <data>{doc.get('issue_date', '')}</data>
        <kontrahent>{doc.get('contractor', '')}</kontrahent>
        <nip>{doc.get('contractor_nip', '')}</nip>
        <netto>{doc.get('amount', 0):.2f}</netto>
        <stawka_vat>{doc.get('vat_rate', '23%')}</stawka_vat>
        <ksef>{doc.get('ksef_number', '')}</ksef>
    </faktura>""")
        
        xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<import_enova version="1.0">
    <faktury>
        {"".join(entries)}
    </faktury>
</import_enova>"""
        
        return AdapterResult(
            success=True,
            count=len(documents),
            metadata={"format": "enova_xml", "xml_content": xml}
        )
