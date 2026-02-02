"""
EXEF KSeF Adapter

Integrates with Polish National e-Invoice System (Krajowy System e-Faktur).

API Documentation: https://ksef.mf.gov.pl/
Test Environment: https://ksef-test.mf.gov.pl/
"""
import httpx
import base64
import hashlib
from datetime import datetime, timedelta
from typing import Optional
from . import BaseAdapter, AdapterResult, register_adapter
import os

# KSeF API URLs
KSEF_URLS = {
    "demo": "https://ksef-demo.mf.gov.pl/api",
    "test": "https://ksef-test.mf.gov.pl/api", 
    "prod": "https://ksef.mf.gov.pl/api"
}


@register_adapter("ksef")
class KSeFAdapter(BaseAdapter):
    """
    KSeF (Krajowy System e-Faktur) adapter
    
    Config:
        - nip: Company NIP number
        - token: MCU authentication token
        - env: Environment (demo/test/prod)
        - cert_path: Path to certificate file (optional)
    """
    
    name = "ksef"
    supports_pull = True
    supports_push = True
    
    def __init__(self, config: dict):
        super().__init__(config)
        self.env = config.get("env", os.getenv("EXEF_KSEF_ENV", "demo"))
        self.nip = config.get("nip", os.getenv("EXEF_KSEF_NIP", ""))
        self.token = config.get("token", os.getenv("EXEF_KSEF_TOKEN", ""))
        self.base_url = KSEF_URLS.get(self.env, KSEF_URLS["demo"])
        self._session_token: Optional[str] = None
        self._session_expires: Optional[datetime] = None
    
    def _validate_config(self) -> bool:
        return bool(self.nip and self.token)
    
    async def _get_session(self) -> str:
        """Get or refresh KSeF session token"""
        if self._session_token and self._session_expires and datetime.utcnow() < self._session_expires:
            return self._session_token
        
        # Initialize session with MCU token
        async with httpx.AsyncClient() as client:
            # Step 1: Get challenge
            challenge_resp = await client.post(
                f"{self.base_url}/online/Session/AuthorisationChallenge",
                json={"contextIdentifier": {"type": "onip", "identifier": self.nip}}
            )
            if challenge_resp.status_code != 200:
                raise Exception(f"KSeF challenge failed: {challenge_resp.text}")
            
            challenge = challenge_resp.json()
            
            # Step 2: Sign challenge and init session
            # In production, this would use the actual MCU token/certificate
            # For demo/test, we use simplified authentication
            init_resp = await client.post(
                f"{self.base_url}/online/Session/InitToken",
                json={
                    "context": {
                        "contextIdentifier": {"type": "onip", "identifier": self.nip},
                        "credentialsRoleList": [{"type": "token", "roleGrantorIdentifier": {"type": "onip", "identifier": self.nip}}]
                    },
                    "challenge": challenge.get("challenge", ""),
                    "authorizationToken": self.token
                }
            )
            
            if init_resp.status_code != 200:
                raise Exception(f"KSeF session init failed: {init_resp.text}")
            
            session_data = init_resp.json()
            self._session_token = session_data.get("sessionToken", {}).get("token")
            self._session_expires = datetime.utcnow() + timedelta(hours=1)
            
            return self._session_token
    
    async def _pull(self) -> AdapterResult:
        """Pull invoices from KSeF"""
        if not self._validate_config():
            return AdapterResult(success=False, errors=["Invalid KSeF configuration"])
        
        try:
            session = await self._get_session()
            documents = []
            
            async with httpx.AsyncClient() as client:
                # Query for incoming invoices
                headers = {"SessionToken": session}
                
                # Get list of invoices from last 30 days
                from_date = (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%dT00:00:00")
                
                query_resp = await client.post(
                    f"{self.base_url}/online/Query/Invoice/Sync",
                    headers=headers,
                    json={
                        "queryCriteria": {
                            "subjectType": "subject2",  # buyer
                            "invoicingDateFrom": from_date
                        }
                    },
                    timeout=30
                )
                
                if query_resp.status_code != 200:
                    return AdapterResult(success=False, errors=[f"Query failed: {query_resp.text}"])
                
                invoices = query_resp.json().get("invoiceHeaderList", [])
                
                for inv in invoices:
                    # Fetch full invoice XML
                    ksef_number = inv.get("ksefReferenceNumber")
                    
                    invoice_resp = await client.get(
                        f"{self.base_url}/online/Invoice/Get/{ksef_number}",
                        headers=headers
                    )
                    
                    if invoice_resp.status_code == 200:
                        invoice_data = invoice_resp.json()
                        
                        # Parse invoice XML to extract key fields
                        doc = self._parse_invoice(invoice_data, inv)
                        documents.append(doc)
            
            self.last_sync = datetime.utcnow()
            
            return AdapterResult(
                success=True,
                count=len(documents),
                documents=documents,
                metadata={"ksef_env": self.env}
            )
            
        except Exception as e:
            return AdapterResult(success=False, errors=[str(e)])
    
    async def _push(self, documents: list[dict]) -> AdapterResult:
        """Push invoices to KSeF"""
        if not self._validate_config():
            return AdapterResult(success=False, errors=["Invalid KSeF configuration"])
        
        try:
            session = await self._get_session()
            sent_count = 0
            errors = []
            
            async with httpx.AsyncClient() as client:
                headers = {"SessionToken": session}
                
                for doc in documents:
                    # Generate FA(2) XML
                    invoice_xml = self._generate_invoice_xml(doc)
                    
                    # Calculate hash
                    xml_bytes = invoice_xml.encode('utf-8')
                    file_hash = hashlib.sha256(xml_bytes).digest()
                    hash_b64 = base64.b64encode(file_hash).decode()
                    
                    # Send invoice
                    send_resp = await client.put(
                        f"{self.base_url}/online/Invoice/Send",
                        headers={**headers, "Content-Type": "application/octet-stream"},
                        content=xml_bytes,
                        params={"hash": hash_b64}
                    )
                    
                    if send_resp.status_code == 200:
                        result = send_resp.json()
                        doc["ksef_number"] = result.get("elementReferenceNumber")
                        sent_count += 1
                    else:
                        errors.append(f"Failed to send {doc.get('number')}: {send_resp.text}")
            
            self.last_sync = datetime.utcnow()
            
            return AdapterResult(
                success=len(errors) == 0,
                count=sent_count,
                documents=documents,
                errors=errors,
                metadata={"ksef_env": self.env}
            )
            
        except Exception as e:
            return AdapterResult(success=False, errors=[str(e)])
    
    def _parse_invoice(self, invoice_data: dict, header: dict) -> dict:
        """Parse KSeF invoice response to document format"""
        # Extract from XML or JSON response
        return {
            "type": "invoice",
            "number": header.get("invoiceNumber", ""),
            "ksef_number": header.get("ksefReferenceNumber", ""),
            "contractor": header.get("subjectName", ""),
            "contractor_nip": header.get("subjectNip", ""),
            "amount": float(header.get("invoiceAmount", 0)),
            "vat_amount": float(header.get("vatAmount", 0)),
            "vat_rate": "23%",  # Would parse from XML
            "issue_date": header.get("invoicingDate", ""),
            "source": "ksef",
            "raw_data": invoice_data
        }
    
    def _generate_invoice_xml(self, doc: dict) -> str:
        """Generate FA(2) XML from document"""
        # Simplified FA(2) template
        # In production, use proper XML library (lxml) with full FA(2) schema
        template = f"""<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
    <Naglowek>
        <KodFormularza kodSystemowy="FA (2)" wersjaSchemy="1-0E">FA</KodFormularza>
        <WariantFormularza>2</WariantFormularza>
        <DataWytworzeniaFa>{datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S')}</DataWytworzeniaFa>
        <SystemInfo>EXEF</SystemInfo>
    </Naglowek>
    <Podmiot1>
        <DaneIdentyfikacyjne>
            <NIP>{self.nip}</NIP>
        </DaneIdentyfikacyjne>
    </Podmiot1>
    <Podmiot2>
        <DaneIdentyfikacyjne>
            <NIP>{doc.get('contractor_nip', '')}</NIP>
        </DaneIdentyfikacyjne>
    </Podmiot2>
    <Fa>
        <KodWaluty>PLN</KodWaluty>
        <P_1>{doc.get('issue_date', datetime.utcnow().strftime('%Y-%m-%d'))}</P_1>
        <P_2>{doc.get('number', '')}</P_2>
        <P_15>{doc.get('amount', 0):.2f}</P_15>
    </Fa>
</Faktura>"""
        return template
    
    async def test_connection(self) -> bool:
        """Test KSeF connection"""
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"{self.base_url}/status", timeout=5)
                return resp.status_code == 200
        except:
            return False


# Mock adapter for testing without real KSeF
@register_adapter("ksef_mock")
class KSeFMockAdapter(BaseAdapter):
    """Mock KSeF adapter for testing"""
    
    name = "ksef_mock"
    supports_pull = True
    supports_push = True
    
    async def _pull(self) -> AdapterResult:
        import uuid
        docs = [
            {
                "type": "invoice",
                "number": f"KSEF-{uuid.uuid4().hex[:8].upper()}",
                "ksef_number": f"1234567890-20260201-{uuid.uuid4().hex[:6].upper()}",
                "contractor": "Mock Supplier Sp. z o.o.",
                "contractor_nip": "1234567890",
                "amount": 1000.00,
                "vat_amount": 230.00,
                "vat_rate": "23%",
                "issue_date": datetime.utcnow().strftime("%Y-%m-%d"),
                "source": "ksef_mock"
            }
        ]
        self.last_sync = datetime.utcnow()
        return AdapterResult(success=True, count=1, documents=docs)
    
    async def _push(self, documents: list[dict]) -> AdapterResult:
        import uuid
        for doc in documents:
            doc["ksef_number"] = f"1234567890-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
        self.last_sync = datetime.utcnow()
        return AdapterResult(success=True, count=len(documents), documents=documents)
