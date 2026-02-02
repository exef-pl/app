"""
EXEF Signature Adapter
Obsługa podpisu kwalifikowanego, pieczęci i znacznika czasu
Dostawcy: mSzafir (KIR), SimplySign, Certum, CloudSigner
"""

import asyncio
import base64
import hashlib
import json
from abc import abstractmethod
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional, Dict, Any, List
import httpx
import os
from fastapi import HTTPException


class SignatureType(Enum):
    """Typy podpisu elektronicznego"""
    QES = "qualified_signature"      # Podpis kwalifikowany (osoba)
    QSEAL = "qualified_seal"         # Pieczęć kwalifikowana (firma)
    ADVANCED = "advanced_signature"  # Podpis zaawansowany
    TIMESTAMP = "timestamp"          # Znacznik czasu


class SignatureFormat(Enum):
    """Formaty podpisu"""
    PADES = "PAdES"      # PDF Advanced Electronic Signatures
    XADES = "XAdES"      # XML Advanced Electronic Signatures
    CADES = "CAdES"      # CMS Advanced Electronic Signatures
    ASIC = "ASiC"        # Associated Signature Containers


class SignatureLevel(Enum):
    """Poziomy podpisu (zgodne z eIDAS)"""
    B = "B"      # Basic - sam podpis
    T = "T"      # Timestamp - z znacznikiem czasu
    LT = "LT"    # Long-Term - z danymi walidacji
    LTA = "LTA"  # Long-Term Archival - archiwizacja


# ============================================================
# BASE SIGNATURE PROVIDER
# ============================================================

class SignatureProvider:
    """Bazowa klasa dla dostawców podpisu"""
    
    def __init__(self, config: dict):
        self.config = config
        self.name = "base"
    
    @abstractmethod
    async def sign(
        self,
        document: bytes,
        sig_type: SignatureType,
        sig_format: SignatureFormat,
        sig_level: SignatureLevel = SignatureLevel.T
    ) -> dict:
        """Podpisz dokument"""
        raise NotImplementedError
    
    @abstractmethod
    async def verify(self, signed_document: bytes) -> dict:
        """Weryfikuj podpis"""
        raise NotImplementedError
    
    @abstractmethod
    async def get_certificates(self) -> list[dict]:
        """Pobierz dostępne certyfikaty"""
        raise NotImplementedError
    
    async def timestamp(self, document: bytes) -> dict:
        """Dodaj znacznik czasu (TSA)"""
        raise NotImplementedError


# ============================================================
# MOCK PROVIDER (do testów)
# ============================================================

class MockSignatureProvider(SignatureProvider):
    """Mock provider do testów - symuluje podpis bez prawdziwej kryptografii"""
    
    def __init__(self, config: dict):
        super().__init__(config)
        self.name = "mock"
    
    async def sign(
        self,
        document: bytes,
        sig_type: SignatureType,
        sig_format: SignatureFormat,
        sig_level: SignatureLevel = SignatureLevel.T
    ) -> dict:
        """Symuluj podpis dokumentu"""
        # Symuluj opóźnienie autoryzacji
        await asyncio.sleep(1)
        
        # Dodaj znacznik czasu
        timestamp = datetime.utcnow().isoformat()
        
        # Symuluj podpisany dokument (w rzeczywistości byłby to poprawnie podpisany plik)
        doc_hash = hashlib.sha256(document).hexdigest()
        signature_data = {
            "signed_by": "Jan Kowalski (MOCK)",
            "certificate_id": "MOCK-CERT-001",
            "signature_hash": doc_hash,
            "timestamp": timestamp,
            "signature_type": sig_type.value,
            "format": sig_format.value,
            "level": sig_level.value
        }
        
        # W rzeczywistości zwrócono by podpisany dokument
        # Tutaj zwracamy oryginał z metadanymi podpisu
        return {
            "success": True,
            "signed_document": document,  # W rzeczywistości byłby to podpisany dokument
            "signature_id": f"MOCK-SIG-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "signer": {
                "name": "Jan Kowalski",
                "nip": "1234567890",
                "certificate": "MOCK-CERT-001"
            },
            "timestamp": timestamp,
            "signature_data": signature_data,
            "provider": self.name
        }
    
    async def verify(self, signed_document: bytes) -> dict:
        """Symuluj weryfikację podpisu"""
        await asyncio.sleep(0.5)
        
        return {
            "valid": True,
            "signatures": [{
                "signer": "Jan Kowalski",
                "certificate": "MOCK-CERT-001",
                "valid_from": "2025-01-01T00:00:00Z",
                "valid_to": "2026-01-01T00:00:00Z",
                "signature_type": "qualified",
                "level": "T"
            }],
            "timestamps": [{
                "tsa": "MOCK TSA",
                "timestamp": datetime.utcnow().isoformat()
            }],
            "certificate_chain": ["MOCK-ROOT-CA", "MOCK-INTERMEDIATE-CA", "MOCK-CERT-001"],
            "provider": self.name
        }
    
    async def get_certificates(self) -> list[dict]:
        """Zwróć mock certyfikaty"""
        return [{
            "id": "MOCK-CERT-001",
            "subject": "CN=Jan Kowalski, SERIALNUMBER=PESEL:12345678901, O=FIRMA TEST",
            "issuer": "CN=EXEF Test CA",
            "valid_from": "2025-01-01T00:00:00Z",
            "valid_to": "2026-01-01T00:00:00Z",
            "type": "qualified",
            "usage": ["digital_signature", "key_encipherment"],
            "provider": self.name
        }]
    
    async def timestamp(self, document: bytes) -> dict:
        """Dodaj mock znacznik czasu"""
        return {
            "success": True,
            "timestamp_token": f"MOCK-TS-{base64.b64encode(document).decode()[:20]}",
            "tsa": "MOCK TSA",
            "timestamp": datetime.utcnow().isoformat(),
            "provider": self.name
        }


# ============================================================
# MAIN SIGNATURE ADAPTER
# ============================================================

class SignatureAdapter:
    """
    Główny adapter podpisu elektronicznego
    Agreguje dostawców (mock, mSzafir, SimplySign, CloudSigner)
    """
    
    PROVIDERS = {
        "mock": MockSignatureProvider,
        # W przyszłości dodać prawdziwych dostawców:
        # "mszafir": MSzafirProvider,
        # "cloudsigner": CloudSignerProvider,
        # "simplysign": SimplySignProvider,
        # "mobywatel": MObywatelProvider,
    }
    
    def __init__(self, config: dict = None):
        self.config = config or {}
        self.provider_name = os.getenv("EXEF_SIGNATURE_PROVIDER", "mock")
        provider_class = self.PROVIDERS.get(self.provider_name)
        if not provider_class:
            raise ValueError(f"Unknown provider: {self.provider_name}")
        self.provider = provider_class(self.config)
    
    async def sign_documents(
        self,
        documents: List[Dict[str, Any]],
        sig_type: SignatureType = SignatureType.QES,
        sig_format: SignatureFormat = SignatureFormat.PADES,
        sig_level: SignatureLevel = SignatureLevel.T
    ) -> Dict[str, Any]:
        """Podpisz wiele dokumentów"""
        results = []
        
        for doc in documents:
            # Pobierz zawartość dokumentu
            file_content = doc.get("file_content") or doc.get("content")
            if isinstance(file_content, str):
                file_content = base64.b64decode(file_content)
            
            if not file_content:
                results.append({
                    "document_id": doc.get("id"),
                    "success": False,
                    "error": "No document content"
                })
                continue
            
            # Podpisz dokument
            result = await self.provider.sign(
                document=file_content,
                sig_type=sig_type,
                sig_format=sig_format,
                sig_level=sig_level
            )
            
            results.append({
                "document_id": doc.get("id"),
                "success": result.get("success", False),
                "signed_document": result.get("signed_document"),
                "signature_id": result.get("signature_id"),
                "signer": result.get("signer"),
                "error": result.get("error"),
                "timestamp": result.get("timestamp"),
                "provider": self.provider_name
            })
        
        success_count = sum(1 for r in results if r["success"])
        
        return {
            "success": success_count == len(results),
            "total": len(results),
            "signed": success_count,
            "failed": len(results) - success_count,
            "results": results,
            "provider": self.provider_name,
            "signature_type": sig_type.value,
            "format": sig_format.value,
            "level": sig_level.value
        }
    
    async def verify_signature(self, signed_document: bytes) -> dict:
        """Weryfikuj podpis dokumentu"""
        return await self.provider.verify(signed_document)
    
    async def get_certificates(self) -> List[Dict[str, Any]]:
        """Pobierz dostępne certyfikaty"""
        return await self.provider.get_certificates()
    
    async def add_timestamp(self, document: bytes) -> dict:
        """Dodaj znacznik czasu"""
        if hasattr(self.provider, "timestamp"):
            return await self.provider.timestamp(document)
        return {"success": False, "error": "Provider nie obsługuje TSA"}


# Global instance
_signature_adapter = None

def get_signature_adapter():
    """Pobierz instancję adaptera podpisu"""
    global _signature_adapter
    if _signature_adapter is None:
        _signature_adapter = SignatureAdapter()
    return _signature_adapter
