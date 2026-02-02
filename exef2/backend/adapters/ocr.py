"""
EXEF OCR Adapter

Extracts text and invoice data from PDF/image documents.
Supports multiple OCR providers:
- Tesseract (local, free)
- Google Vision API
- Azure AI Vision
- External REST API
"""
import base64
import re
from datetime import datetime
from typing import Optional
from . import BaseAdapter, AdapterResult, register_adapter


# OCR provider configurations
OCR_PROVIDERS = {
    "tesseract": {"name": "Tesseract (local)", "requires_api_key": False},
    "google_vision": {"name": "Google Cloud Vision", "requires_api_key": True},
    "azure_vision": {"name": "Azure AI Vision", "requires_api_key": True},
    "exef_pro": {"name": "EXEF Pro (self-hosted)", "requires_api_key": False},
}


class InvoiceExtractor:
    """Extract invoice data from OCR text"""
    
    # Polish invoice patterns
    PATTERNS = {
        "invoice_number": [
            r"(?:Faktura|FV|FA)[\s:]*([A-Z0-9/-]+)",
            r"Nr\s*faktury[\s:]*([A-Z0-9/-]+)",
            r"Numer[\s:]*([A-Z0-9/-]+)",
        ],
        "date": [
            r"Data\s*wystawienia[\s:]*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})",
            r"(\d{1,2}[./-]\d{1,2}[./-]\d{4})",
        ],
        "nip": [
            r"NIP[\s:]*(\d{3}[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2})",
            r"NIP[\s:]*(\d{10})",
        ],
        "amount": [
            r"(?:Razem|Suma|Do\s*zapłaty|BRUTTO)[\s:]*(\d+[.,]\d{2})\s*(?:PLN|zł)?",
            r"(\d+[.,]\d{2})\s*(?:PLN|zł)",
        ],
        "vat": [
            r"VAT[\s:]*(\d+[.,]\d{2})",
            r"(\d+)%",
        ],
    }
    
    def extract(self, text: str) -> dict:
        """Extract invoice data from OCR text"""
        result = {
            "invoice_number": self._find_first(text, self.PATTERNS["invoice_number"]),
            "issue_date": self._normalize_date(self._find_first(text, self.PATTERNS["date"])),
            "contractor_nip": self._normalize_nip(self._find_first(text, self.PATTERNS["nip"])),
            "gross_amount": self._parse_amount(self._find_first(text, self.PATTERNS["amount"])),
            "vat_rate": self._find_first(text, self.PATTERNS["vat"]),
            "raw_text": text[:1000] if text else None,
            "confidence": self._calculate_confidence(text),
        }
        return result
    
    def _find_first(self, text: str, patterns: list) -> Optional[str]:
        """Find first matching pattern"""
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1)
        return None
    
    def _normalize_date(self, date_str: Optional[str]) -> Optional[str]:
        """Normalize date to ISO format"""
        if not date_str:
            return None
        # Try various formats
        for fmt in ["%d.%m.%Y", "%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d"]:
            try:
                dt = datetime.strptime(date_str, fmt)
                return dt.strftime("%Y-%m-%d")
            except ValueError:
                continue
        return date_str
    
    def _normalize_nip(self, nip: Optional[str]) -> Optional[str]:
        """Normalize NIP to 10 digits"""
        if not nip:
            return None
        return re.sub(r"[^0-9]", "", nip)
    
    def _parse_amount(self, amount_str: Optional[str]) -> Optional[float]:
        """Parse amount string to float"""
        if not amount_str:
            return None
        try:
            return float(amount_str.replace(",", ".").replace(" ", ""))
        except ValueError:
            return None
    
    def _calculate_confidence(self, text: str) -> int:
        """Calculate extraction confidence (0-100)"""
        if not text:
            return 0
        
        score = 0
        # Check for key invoice indicators
        indicators = ["faktura", "nip", "vat", "brutto", "netto", "data"]
        text_lower = text.lower()
        
        for indicator in indicators:
            if indicator in text_lower:
                score += 15
        
        return min(score, 100)


@register_adapter("ocr")
class OCRAdapter(BaseAdapter):
    """
    OCR processing adapter
    
    Config:
        - provider: OCR provider (tesseract/google_vision/azure_vision/exef_pro)
        - api_key: API key for cloud providers
        - api_url: Custom API URL for exef_pro
        - language: OCR language (default: pol)
    """
    
    name = "ocr"
    supports_pull = False
    supports_push = True  # Process documents
    
    def __init__(self, config: dict):
        super().__init__(config)
        self.provider = config.get("provider", "tesseract")
        self.api_key = config.get("api_key", "")
        self.api_url = config.get("api_url", "http://localhost:8095/ocr")
        self.language = config.get("language", "pol")
        self.extractor = InvoiceExtractor()
    
    async def _pull(self) -> AdapterResult:
        return AdapterResult(success=False, errors=["Pull not supported for OCR"])
    
    async def _push(self, documents: list[dict]) -> AdapterResult:
        """Process documents with OCR"""
        results = []
        errors = []
        
        for doc in documents:
            try:
                # Get file content
                file_content = doc.get("attachment_content") or doc.get("file_content")
                file_type = doc.get("attachment_mime") or doc.get("file_type", "")
                
                if not file_content:
                    errors.append(f"No file content for document {doc.get('id', 'unknown')}")
                    continue
                
                # Decode base64 if needed
                if isinstance(file_content, str):
                    file_bytes = base64.b64decode(file_content)
                else:
                    file_bytes = file_content
                
                # Run OCR based on provider
                ocr_text = await self._run_ocr(file_bytes, file_type)
                
                # Extract invoice data
                extracted = self.extractor.extract(ocr_text)
                
                # Merge with document
                processed_doc = {
                    **doc,
                    "ocr_text": ocr_text,
                    "ocr_data": extracted,
                    "number": extracted.get("invoice_number") or doc.get("number"),
                    "contractor_nip": extracted.get("contractor_nip") or doc.get("contractor_nip"),
                    "amount": extracted.get("gross_amount") or doc.get("amount"),
                    "issue_date": extracted.get("issue_date") or doc.get("issue_date"),
                    "ocr_confidence": extracted.get("confidence", 0),
                    "processed_at": datetime.utcnow().isoformat(),
                }
                results.append(processed_doc)
                
            except Exception as e:
                errors.append(f"OCR failed for {doc.get('id', 'unknown')}: {str(e)}")
        
        self.last_sync = datetime.utcnow()
        
        return AdapterResult(
            success=len(errors) == 0,
            count=len(results),
            documents=results,
            errors=errors,
            metadata={"provider": self.provider}
        )
    
    async def _run_ocr(self, file_bytes: bytes, file_type: str) -> str:
        """Run OCR on file bytes"""
        if self.provider == "tesseract":
            return await self._ocr_tesseract(file_bytes, file_type)
        elif self.provider == "google_vision":
            return await self._ocr_google(file_bytes)
        elif self.provider == "azure_vision":
            return await self._ocr_azure(file_bytes)
        elif self.provider == "exef_pro":
            return await self._ocr_exef_pro(file_bytes, file_type)
        else:
            raise ValueError(f"Unknown OCR provider: {self.provider}")
    
    async def _ocr_tesseract(self, file_bytes: bytes, file_type: str) -> str:
        """OCR using local Tesseract"""
        import asyncio
        import tempfile
        import subprocess
        import os
        
        # Write to temp file
        suffix = ".pdf" if "pdf" in file_type.lower() else ".png"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(file_bytes)
            temp_path = f.name
        
        try:
            # For PDF, convert to image first (requires poppler)
            if suffix == ".pdf":
                # pdftoppm -png input.pdf output
                img_path = temp_path.replace(".pdf", "")
                process = await asyncio.create_subprocess_exec(
                    "pdftoppm", "-png", "-singlefile", temp_path, img_path,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE
                )
                await process.wait()
                temp_path = f"{img_path}.png"
            
            # Run tesseract
            process = await asyncio.create_subprocess_exec(
                "tesseract", temp_path, "stdout", "-l", self.language,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE
            )
            stdout, _ = await process.communicate()
            return stdout.decode("utf-8", errors="replace")
            
        finally:
            # Cleanup
            try:
                os.unlink(temp_path)
            except:
                pass
    
    async def _ocr_google(self, file_bytes: bytes) -> str:
        """OCR using Google Cloud Vision API"""
        import httpx
        
        url = f"https://vision.googleapis.com/v1/images:annotate?key={self.api_key}"
        
        request_body = {
            "requests": [{
                "image": {"content": base64.b64encode(file_bytes).decode()},
                "features": [{"type": "TEXT_DETECTION"}]
            }]
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=request_body, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            annotations = data.get("responses", [{}])[0].get("textAnnotations", [])
            
            if annotations:
                return annotations[0].get("description", "")
            return ""
    
    async def _ocr_azure(self, file_bytes: bytes) -> str:
        """OCR using Azure AI Vision"""
        import httpx
        
        url = f"{self.api_url}/vision/v3.2/read/analyze"
        headers = {
            "Ocp-Apim-Subscription-Key": self.api_key,
            "Content-Type": "application/octet-stream"
        }
        
        async with httpx.AsyncClient() as client:
            # Submit for analysis
            response = await client.post(url, headers=headers, content=file_bytes, timeout=30)
            response.raise_for_status()
            
            # Get operation URL
            operation_url = response.headers.get("Operation-Location")
            
            # Poll for results
            import asyncio
            for _ in range(10):
                await asyncio.sleep(1)
                result = await client.get(operation_url, headers={"Ocp-Apim-Subscription-Key": self.api_key})
                result_data = result.json()
                
                if result_data.get("status") == "succeeded":
                    lines = []
                    for page in result_data.get("analyzeResult", {}).get("readResults", []):
                        for line in page.get("lines", []):
                            lines.append(line.get("text", ""))
                    return "\n".join(lines)
            
            return ""
    
    async def _ocr_exef_pro(self, file_bytes: bytes, file_type: str) -> str:
        """OCR using EXEF Pro self-hosted service"""
        import httpx
        
        async with httpx.AsyncClient() as client:
            files = {"file": ("document", file_bytes, file_type)}
            response = await client.post(self.api_url, files=files, timeout=60)
            response.raise_for_status()
            
            data = response.json()
            return data.get("text", "")


@register_adapter("ocr_mock")
class OCRMockAdapter(BaseAdapter):
    """Mock OCR adapter for testing"""
    
    name = "ocr_mock"
    supports_pull = False
    supports_push = True
    
    async def _pull(self) -> AdapterResult:
        return AdapterResult(success=False, errors=["Pull not supported"])
    
    async def _push(self, documents: list[dict]) -> AdapterResult:
        """Mock OCR processing"""
        results = []
        
        for doc in documents:
            results.append({
                **doc,
                "ocr_text": "Faktura VAT nr FV/2026/01/001\nNIP: 1234567890\nData: 01.02.2026\nBrutto: 1230.00 PLN",
                "ocr_data": {
                    "invoice_number": "FV/2026/01/001",
                    "issue_date": "2026-02-01",
                    "contractor_nip": "1234567890",
                    "gross_amount": 1230.00,
                    "confidence": 85,
                },
                "number": doc.get("number") or "FV/2026/01/001",
                "amount": doc.get("amount") or 1230.00,
                "ocr_confidence": 85,
                "processed_at": datetime.utcnow().isoformat(),
            })
        
        self.last_sync = datetime.utcnow()
        return AdapterResult(success=True, count=len(results), documents=results)
