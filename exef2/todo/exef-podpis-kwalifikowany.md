# EXEF - Rozbudowa o Podpis Elektroniczny Kwalifikowany

## Streszczenie wykonawcze

Rozbudowa EXEF o podpis kwalifikowany to strategiczny krok umożliwiający:
- **Autoryzację KSeF** - certyfikaty MCU zamiast tokenów (obowiązkowe od końca 2026)
- **Podpisywanie dokumentów** - faktury, umowy, wnioski
- **Automatyzację** - pieczęć kwalifikowana dla masowego przetwarzania
- **Zgodność eIDAS** - uznawanie w całej UE

---

## 1. Architektura Modułu Podpisu

### 1.1 Nowy Adapter: `backend/adapters/signature.py`

```
┌─────────────────────────────────────────────────────────────────┐
│                        EXEF Desktop                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Frontend   │  │   Router     │  │  WebSocket   │          │
│  │   (HTML/JS)  │◄─►│   (routes)   │◄─►│  (realtime)  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
├─────────────────────────────────────────────────────────────────┤
│                        ADAPTER LAYER                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐      │
│  │  KSeF    │ │  Email   │ │   OCR    │ │  SIGNATURE    │      │
│  │ Adapter  │ │ Adapter  │ │ Adapter  │ │   Adapter     │      │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └───────┬───────┘      │
│       │            │            │               │               │
├───────┼────────────┼────────────┼───────────────┼───────────────┤
│       │            │            │               │               │
│       ▼            ▼            ▼               ▼               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    PROVIDER LAYER                         │  │
│  │  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌───────────┐   │  │
│  │  │ mSzafir │  │ Certum/  │  │ SIGILLUM│  │ mObywatel │   │  │
│  │  │  (KIR)  │  │ SimSign  │  │ (PWPW)  │  │  (free)   │   │  │
│  │  └────┬────┘  └────┬─────┘  └────┬────┘  └─────┬─────┘   │  │
│  └───────┼────────────┼─────────────┼─────────────┼─────────┘  │
│          │            │             │             │             │
└──────────┼────────────┼─────────────┼─────────────┼─────────────┘
           │            │             │             │
           ▼            ▼             ▼             ▼
    ┌──────────────────────────────────────────────────────────┐
    │                  EXTERNAL SERVICES                        │
    │  • API mSzafir (KIR)     • Szafir SDK (desktop)          │
    │  • SimplySign API        • CloudSigner (PKCS#11)         │
    │  • SIGILLUM API          • mObywatel redirect            │
    └──────────────────────────────────────────────────────────┘
```

### 1.2 Typy Podpisu

| Typ | Zastosowanie | Automatyzacja | Dostawcy |
|-----|--------------|---------------|----------|
| **Podpis kwalifikowany** | Osoby fizyczne, KSeF autoryzacja | Nie | mSzafir, SimplySign, CenCert |
| **Pieczęć kwalifikowana** | Firmy, masowe faktury do KSeF | Tak | KIR, Certum, EuroCert |
| **Znacznik czasu** | Dowód istnienia dokumentu | Tak | KIR TSA, Certum TSA |
| **Podpis zaawansowany** | Umowy, dokumenty wewnętrzne | Częściowo | Autenti, DocuSign |

---

## 2. Integracja z Dostawcami

### 2.1 KIR mSzafir (rekomendowany)

**Zalety:**
- Wariant integracyjny z API
- Certyfikaty jednorazowe i długoterminowe
- Weryfikacja przez bankowość online (mojeID)
- Środowisko testowe dostępne

**Komponenty:**
```
Szafir SDK          → Desktop signing (PKCS#11)
API mSzafir         → Cloud signing (REST)
CloudSigner         → Virtual card management
```

**Koszt:** od 299 zł/rok (chmura) lub per-podpis

### 2.2 SimplySign (Asseco)

**Zalety:**
- Popularna w administracji publicznej
- Dobra integracja z ERP
- REST API dla automatyzacji

### 2.3 mObywatel (bezpłatny!)

**Zalety:**
- 5 podpisów miesięcznie za darmo
- Polska pierwsza w UE
- Weryfikacja przez dowód z NFC

**Ograniczenia:**
- Tylko PDF do 5 MB
- Wymaga przekierowania do aplikacji mobilnej
- Brak API dla automatyzacji

---

## 3. Implementacja Adaptera

### 3.1 Struktura pliku `backend/adapters/signature.py`

```python
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
from typing import Optional
import httpx

from . import BaseAdapter, AdapterResult, register_adapter


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
# KIR mSzafir PROVIDER
# ============================================================

class MSzafirProvider(SignatureProvider):
    """
    Integracja z KIR mSzafir
    Dokumentacja: https://www.elektronicznypodpis.pl/szafir-integracja-podpisu-elektronicznego
    """
    
    API_PROD = "https://api.mszafir.pl"
    API_TEST = "https://api-test.mszafir.pl"
    TSA_URL = "https://tsa.kir.com.pl"
    
    def __init__(self, config: dict):
        super().__init__(config)
        self.name = "mszafir"
        self.api_key = config.get("api_key")
        self.api_secret = config.get("api_secret")
        self.environment = config.get("environment", "test")
        self.base_url = self.API_PROD if self.environment == "prod" else self.API_TEST
    
    async def _get_auth_token(self) -> str:
        """Pobierz token autoryzacyjny"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/oauth/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.api_key,
                    "client_secret": self.api_secret
                }
            )
            response.raise_for_status()
            return response.json()["access_token"]
    
    async def sign(
        self,
        document: bytes,
        sig_type: SignatureType,
        sig_format: SignatureFormat,
        sig_level: SignatureLevel = SignatureLevel.T
    ) -> dict:
        """Podpisz dokument przez mSzafir API"""
        
        token = await self._get_auth_token()
        doc_base64 = base64.b64encode(document).decode()
        doc_hash = hashlib.sha256(document).hexdigest()
        
        payload = {
            "document": doc_base64,
            "documentHash": doc_hash,
            "hashAlgorithm": "SHA256",
            "signatureFormat": sig_format.value,
            "signatureLevel": sig_level.value,
            "signatureType": "qualified" if sig_type == SignatureType.QES else "seal"
        }
        
        async with httpx.AsyncClient() as client:
            # Krok 1: Inicjuj sesję podpisu
            response = await client.post(
                f"{self.base_url}/signing/init",
                headers={"Authorization": f"Bearer {token}"},
                json=payload
            )
            response.raise_for_status()
            session = response.json()
            
            # Krok 2: Poczekaj na autoryzację użytkownika (w app mobilnej)
            # W produkcji: webhook lub polling
            session_id = session["sessionId"]
            
            # Krok 3: Pobierz podpisany dokument
            for _ in range(30):  # max 30 sekund
                await asyncio.sleep(1)
                status = await client.get(
                    f"{self.base_url}/signing/status/{session_id}",
                    headers={"Authorization": f"Bearer {token}"}
                )
                status_data = status.json()
                
                if status_data["status"] == "completed":
                    return {
                        "success": True,
                        "signed_document": base64.b64decode(status_data["signedDocument"]),
                        "signature_id": status_data["signatureId"],
                        "signer": status_data.get("signerInfo", {}),
                        "timestamp": status_data.get("timestamp"),
                        "provider": self.name
                    }
                elif status_data["status"] == "failed":
                    return {
                        "success": False,
                        "error": status_data.get("error", "Signing failed"),
                        "provider": self.name
                    }
            
            return {"success": False, "error": "Timeout waiting for signature"}
    
    async def verify(self, signed_document: bytes) -> dict:
        """Weryfikuj podpis"""
        token = await self._get_auth_token()
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/verification/verify",
                headers={"Authorization": f"Bearer {token}"},
                json={"document": base64.b64encode(signed_document).decode()}
            )
            response.raise_for_status()
            result = response.json()
            
            return {
                "valid": result["valid"],
                "signatures": result.get("signatures", []),
                "timestamps": result.get("timestamps", []),
                "certificate_chain": result.get("certificateChain", []),
                "provider": self.name
            }
    
    async def get_certificates(self) -> list[dict]:
        """Pobierz certyfikaty użytkownika"""
        token = await self._get_auth_token()
        
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/certificates/list",
                headers={"Authorization": f"Bearer {token}"}
            )
            response.raise_for_status()
            return response.json()["certificates"]
    
    async def timestamp(self, document: bytes) -> dict:
        """Dodaj znacznik czasu TSA KIR"""
        doc_hash = hashlib.sha256(document).digest()
        
        # RFC 3161 Timestamp Request
        # W produkcji: użyj biblioteki asn1crypto lub własnej implementacji
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.TSA_URL,
                headers={"Content-Type": "application/timestamp-query"},
                content=self._build_tsa_request(doc_hash)
            )
            response.raise_for_status()
            
            return {
                "success": True,
                "timestamp_token": response.content,
                "tsa": "KIR TSA",
                "provider": self.name
            }
    
    def _build_tsa_request(self, doc_hash: bytes) -> bytes:
        """Buduj żądanie TSA (RFC 3161)"""
        # Uproszczona wersja - w produkcji użyj asn1crypto
        return doc_hash  # placeholder


# ============================================================
# CLOUDSIGNER PROVIDER (Desktop/PKCS#11)
# ============================================================

class CloudSignerProvider(SignatureProvider):
    """
    Integracja z CloudSigner dla certyfikatów na karcie/USB
    Wymaga zainstalowanego CloudSigner na maszynie użytkownika
    """
    
    SOCKET_PATH = "ws://127.0.0.1:8765"  # Local CloudSigner WebSocket
    
    def __init__(self, config: dict):
        super().__init__(config)
        self.name = "cloudsigner"
        self.pkcs11_library = config.get("pkcs11_library")
        self.pin = config.get("pin")  # Bezpieczne przechowywanie!
    
    async def sign(
        self,
        document: bytes,
        sig_type: SignatureType,
        sig_format: SignatureFormat,
        sig_level: SignatureLevel = SignatureLevel.T
    ) -> dict:
        """Podpisz przez lokalny CloudSigner"""
        import websockets
        
        try:
            async with websockets.connect(self.SOCKET_PATH) as ws:
                # Wyślij żądanie podpisu
                request = {
                    "action": "sign",
                    "document": base64.b64encode(document).decode(),
                    "format": sig_format.value,
                    "level": sig_level.value,
                    "certificateId": self.config.get("certificate_id")
                }
                await ws.send(json.dumps(request))
                
                # Czekaj na odpowiedź (z PIN w oknie dialogowym)
                response = json.loads(await ws.recv())
                
                if response.get("success"):
                    return {
                        "success": True,
                        "signed_document": base64.b64decode(response["signedDocument"]),
                        "signer": response.get("signerInfo", {}),
                        "provider": self.name
                    }
                else:
                    return {
                        "success": False,
                        "error": response.get("error", "Signing failed"),
                        "provider": self.name
                    }
        except Exception as e:
            return {
                "success": False,
                "error": f"CloudSigner connection failed: {str(e)}",
                "provider": self.name
            }
    
    async def verify(self, signed_document: bytes) -> dict:
        """Weryfikuj lokalnie przez Szafir SDK"""
        # Użyj Szafir SDK do weryfikacji
        pass
    
    async def get_certificates(self) -> list[dict]:
        """Pobierz certyfikaty z lokalnej karty"""
        import websockets
        
        async with websockets.connect(self.SOCKET_PATH) as ws:
            await ws.send(json.dumps({"action": "listCertificates"}))
            response = json.loads(await ws.recv())
            return response.get("certificates", [])


# ============================================================
# SIMPLYSIGN PROVIDER
# ============================================================

class SimplySignProvider(SignatureProvider):
    """Integracja z SimplySign (Asseco)"""
    
    API_URL = "https://cloudsign.assecods.pl/api/v1"
    
    def __init__(self, config: dict):
        super().__init__(config)
        self.name = "simplysign"
        self.client_id = config.get("client_id")
        self.client_secret = config.get("client_secret")
    
    async def sign(
        self,
        document: bytes,
        sig_type: SignatureType,
        sig_format: SignatureFormat,
        sig_level: SignatureLevel = SignatureLevel.T
    ) -> dict:
        """Podpisz przez SimplySign API"""
        # Implementacja analogiczna do mSzafir
        pass
    
    async def verify(self, signed_document: bytes) -> dict:
        pass
    
    async def get_certificates(self) -> list[dict]:
        pass


# ============================================================
# MOBYWATEL PROVIDER (redirect-based)
# ============================================================

class MObywatelProvider(SignatureProvider):
    """
    Integracja z mObywatel (bezpłatny podpis!)
    Uwaga: Brak API - wymaga przekierowania do aplikacji mobilnej
    """
    
    def __init__(self, config: dict):
        super().__init__(config)
        self.name = "mobywatel"
        # mObywatel używa dostawców: CenCert, SimplySign, SIGILLUM, mSzafir
        self.redirect_url = config.get("redirect_url")
    
    async def get_signing_url(self, document_path: str) -> str:
        """
        Generuj URL do podpisania w mObywatel
        Użytkownik musi:
        1. Otworzyć mObywatel
        2. Wybrać dostawcę
        3. Podpisać dokument
        4. Pobrać podpisany plik
        """
        # mObywatel nie ma publicznego API
        # Można jedynie instruować użytkownika
        return "https://mobywatel.gov.pl/uslugi/podpis-kwalifikowany"
    
    async def sign(self, document: bytes, *args, **kwargs) -> dict:
        return {
            "success": False,
            "error": "mObywatel wymaga ręcznego podpisania przez aplikację mobilną",
            "instructions": [
                "1. Otwórz aplikację mObywatel",
                "2. Wybierz 'Podpis kwalifikowany' z kategorii 'Sprawy urzędowe'",
                "3. Wybierz dostawcę (CenCert, SimplySign, SIGILLUM lub mSzafir)",
                "4. Prześlij plik PDF (max 5 MB)",
                "5. Przyłóż dowód osobisty do telefonu (NFC)",
                "6. Pobierz podpisany dokument"
            ],
            "limit": "5 dokumentów miesięcznie za darmo",
            "provider": self.name
        }
    
    async def verify(self, signed_document: bytes) -> dict:
        # Weryfikację można zrobić przez innych dostawców
        pass
    
    async def get_certificates(self) -> list[dict]:
        return []  # mObywatel nie eksponuje certyfikatów


# ============================================================
# MAIN SIGNATURE ADAPTER
# ============================================================

@register_adapter("signature")
class SignatureAdapter(BaseAdapter):
    """
    Główny adapter podpisu elektronicznego
    Agreguje wielu dostawców (mSzafir, SimplySign, CloudSigner)
    """
    
    PROVIDERS = {
        "mszafir": MSzafirProvider,
        "cloudsigner": CloudSignerProvider,
        "simplysign": SimplySignProvider,
        "mobywatel": MObywatelProvider,
    }
    
    def __init__(self, config: dict):
        super().__init__(config)
        self.provider_name = config.get("provider", "mszafir")
        provider_class = self.PROVIDERS.get(self.provider_name)
        if not provider_class:
            raise ValueError(f"Unknown provider: {self.provider_name}")
        self.provider = provider_class(config)
    
    def _validate_config(self) -> bool:
        """Waliduj konfigurację"""
        required = ["provider"]
        return all(k in self.config for k in required)
    
    async def _pull(self) -> AdapterResult:
        """Pobierz dostępne certyfikaty"""
        try:
            certs = await self.provider.get_certificates()
            return AdapterResult(
                success=True,
                documents=[{
                    "id": cert.get("id"),
                    "subject": cert.get("subject"),
                    "issuer": cert.get("issuer"),
                    "valid_from": cert.get("notBefore"),
                    "valid_to": cert.get("notAfter"),
                    "type": cert.get("type", "qualified"),
                    "provider": self.provider_name
                } for cert in certs],
                meta={"provider": self.provider_name}
            )
        except Exception as e:
            return AdapterResult(success=False, error=str(e))
    
    async def _push(self, documents: list[dict]) -> AdapterResult:
        """Podpisz dokumenty"""
        results = []
        
        for doc in documents:
            # Pobierz zawartość pliku
            file_content = doc.get("file_content") or doc.get("content")
            if isinstance(file_content, str):
                file_content = base64.b64decode(file_content)
            
            # Określ typ i format podpisu
            file_type = doc.get("file_type", "pdf").lower()
            sig_format = SignatureFormat.PADES if file_type == "pdf" else SignatureFormat.XADES
            sig_type = SignatureType[self.config.get("signature_type", "QES").upper()]
            sig_level = SignatureLevel[self.config.get("signature_level", "T").upper()]
            
            # Podpisz
            result = await self.provider.sign(
                document=file_content,
                sig_type=sig_type,
                sig_format=sig_format,
                sig_level=sig_level
            )
            
            results.append({
                "document_id": doc.get("id"),
                "signed": result.get("success", False),
                "signed_document": result.get("signed_document"),
                "signature_id": result.get("signature_id"),
                "signer": result.get("signer"),
                "error": result.get("error"),
                "provider": self.provider_name
            })
        
        success = all(r["signed"] for r in results)
        return AdapterResult(
            success=success,
            documents=results,
            meta={"provider": self.provider_name, "count": len(results)}
        )
    
    async def verify_signature(self, signed_document: bytes) -> dict:
        """Weryfikuj podpis dokumentu"""
        return await self.provider.verify(signed_document)
    
    async def add_timestamp(self, document: bytes) -> dict:
        """Dodaj znacznik czasu"""
        if hasattr(self.provider, "timestamp"):
            return await self.provider.timestamp(document)
        return {"success": False, "error": "Provider nie obsługuje TSA"}


# ============================================================
# MOCK ADAPTER (do testów)
# ============================================================

@register_adapter("signature_mock")
class SignatureMockAdapter(BaseAdapter):
    """Mock adapter do testów"""
    
    async def _pull(self) -> AdapterResult:
        return AdapterResult(
            success=True,
            documents=[{
                "id": "cert-mock-001",
                "subject": "CN=Jan Kowalski, SERIALNUMBER=PESEL:12345678901",
                "issuer": "CN=EXEF Test CA",
                "valid_from": "2025-01-01T00:00:00Z",
                "valid_to": "2026-01-01T00:00:00Z",
                "type": "qualified",
                "provider": "mock"
            }]
        )
    
    async def _push(self, documents: list[dict]) -> AdapterResult:
        results = []
        for doc in documents:
            results.append({
                "document_id": doc.get("id"),
                "signed": True,
                "signature_id": f"SIG-MOCK-{datetime.now().strftime('%Y%m%d%H%M%S')}",
                "signer": {"name": "Jan Kowalski (MOCK)", "nip": "1234567890"},
                "provider": "mock"
            })
        return AdapterResult(success=True, documents=results)
```

---

## 4. Integracja z KSeF

### 4.1 Certyfikaty MCU dla KSeF

Od listopada 2025 certyfikaty MCU zastępują tokeny jako docelowa metoda autoryzacji KSeF:

```python
# backend/adapters/ksef.py - rozszerzenie

class KSeFAdapter:
    """Rozszerzenie o podpis certyfikatami MCU"""
    
    async def authorize_with_certificate(self, certificate_pem: str, private_key: bytes):
        """
        Autoryzacja KSeF certyfikatem MCU
        Zastępuje tokeny od końca 2026
        """
        # Podpisz metadane certyfikatem
        metadata = self._generate_metadata()
        signed_metadata = await self._sign_with_mcu(metadata, private_key)
        
        # Wyślij do KSeF
        response = await self._send_authorization(signed_metadata, certificate_pem)
        return response
    
    async def sign_invoice_offline(self, invoice_xml: str, certificate: dict):
        """
        Podpisz fakturę w trybie offline (awaryjnym)
        Wymagane od KSeF 2.0
        """
        # Użyj certyfikatu typu 2 (do podpisywania faktur)
        signed_xml = await self.signature_adapter.provider.sign(
            document=invoice_xml.encode(),
            sig_type=SignatureType.QES,
            sig_format=SignatureFormat.XADES,
            sig_level=SignatureLevel.T
        )
        return signed_xml
```

### 4.2 Pieczęć Kwalifikowana dla Masowego Wysyłania

```python
# Konfiguracja pieczęci dla automatyzacji

seal_config = {
    "provider": "mszafir",
    "signature_type": "QSEAL",  # Pieczęć firmowa
    "signature_level": "T",     # Ze znacznikiem czasu
    "auto_seal": True,          # Automatyczne pieczętowanie
    "certificate_id": "seal-cert-123",
    "api_key": "...",
    "api_secret": "..."
}

# Masowe wysyłanie faktur do KSeF z pieczęcią
async def batch_send_to_ksef(invoices: list[dict]):
    signature_adapter = SignatureAdapter(seal_config)
    ksef_adapter = KSeFAdapter(ksef_config)
    
    for invoice in invoices:
        # 1. Wygeneruj XML faktury
        invoice_xml = generate_invoice_xml(invoice)
        
        # 2. Opieczętuj automatycznie
        sealed = await signature_adapter._push([{
            "id": invoice["id"],
            "content": invoice_xml,
            "file_type": "xml"
        }])
        
        # 3. Wyślij do KSeF
        if sealed.success:
            await ksef_adapter._push([{
                **invoice,
                "signed_xml": sealed.documents[0]["signed_document"]
            }])
```

---

## 5. Workflow Podpisywania w UI

### 5.1 Nowy Komponent Frontend

```javascript
// frontend/components/signature-manager.js

class SignatureManager {
    constructor() {
        this.providers = ['mszafir', 'simplysign', 'cloudsigner', 'mobywatel'];
        this.selectedProvider = 'mszafir';
    }
    
    async render() {
        return `
        <div class="signature-manager">
            <header class="signature-header">
                <h2>🔐 Podpis Elektroniczny</h2>
                <select id="provider-select" onchange="signatureManager.changeProvider(this.value)">
                    <option value="mszafir">mSzafir (KIR)</option>
                    <option value="simplysign">SimplySign (Asseco)</option>
                    <option value="cloudsigner">Karta/USB (lokalnie)</option>
                    <option value="mobywatel">mObywatel (bezpłatny)</option>
                </select>
            </header>
            
            <section class="certificates-section">
                <h3>Twoje certyfikaty</h3>
                <div id="certificates-list"></div>
                <button onclick="signatureManager.refreshCertificates()">
                    🔄 Odśwież
                </button>
            </section>
            
            <section class="sign-section">
                <h3>Podpisz dokumenty</h3>
                <div class="sign-options">
                    <label>
                        <input type="radio" name="sig-type" value="QES" checked>
                        Podpis kwalifikowany (osoba)
                    </label>
                    <label>
                        <input type="radio" name="sig-type" value="QSEAL">
                        Pieczęć kwalifikowana (firma)
                    </label>
                </div>
                <div class="sign-format">
                    <label>Format:</label>
                    <select id="sig-format">
                        <option value="PAdES">PAdES (PDF)</option>
                        <option value="XAdES">XAdES (XML/KSeF)</option>
                    </select>
                </div>
                <div id="documents-to-sign"></div>
                <button class="btn-primary" onclick="signatureManager.signSelected()">
                    ✍️ Podpisz wybrane
                </button>
            </section>
            
            <section class="verify-section">
                <h3>Weryfikuj podpis</h3>
                <input type="file" id="verify-file" accept=".pdf,.xml" 
                       onchange="signatureManager.verifyFile(this.files[0])">
                <div id="verify-result"></div>
            </section>
        </div>
        `;
    }
    
    async refreshCertificates() {
        const response = await fetch(`/api/v1/profiles/default/signature/certificates`);
        const certs = await response.json();
        this.renderCertificates(certs);
    }
    
    async signSelected() {
        const selectedDocs = this.getSelectedDocuments();
        const sigType = document.querySelector('input[name="sig-type"]:checked').value;
        const sigFormat = document.getElementById('sig-format').value;
        
        const response = await fetch(`/api/v1/profiles/default/signature/sign`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                document_ids: selectedDocs,
                signature_type: sigType,
                signature_format: sigFormat
            })
        });
        
        const result = await response.json();
        this.handleSignResult(result);
    }
    
    async verifyFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`/api/v1/profiles/default/signature/verify`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        this.renderVerifyResult(result);
    }
}
```

### 5.2 Nowe Endpointy API

```python
# backend/main.py - nowe endpointy

@app.get("/api/v1/profiles/{profile_id}/signature/certificates")
async def list_certificates(profile_id: str):
    """Lista certyfikatów użytkownika"""
    adapter = get_signature_adapter(profile_id)
    result = await adapter._pull()
    return result.documents

@app.post("/api/v1/profiles/{profile_id}/signature/sign")
async def sign_documents(profile_id: str, body: dict):
    """Podpisz dokumenty"""
    adapter = get_signature_adapter(profile_id)
    documents = get_documents_by_ids(profile_id, body["document_ids"])
    result = await adapter._push(documents)
    return result.to_dict()

@app.post("/api/v1/profiles/{profile_id}/signature/verify")
async def verify_signature(profile_id: str, file: UploadFile):
    """Weryfikuj podpis"""
    adapter = get_signature_adapter(profile_id)
    content = await file.read()
    result = await adapter.verify_signature(content)
    return result
```

---

## 6. Harmonogram Wdrożenia

| Faza | Zakres | Czas | Priorytet |
|------|--------|------|-----------|
| **MVP** | mSzafir API + podstawowy UI | 2 tyg | 🔴 Wysoki |
| **Desktop** | CloudSigner + karta USB | 1 tyg | 🟡 Średni |
| **KSeF** | Certyfikaty MCU + tryb offline | 2 tyg | 🔴 Wysoki |
| **Pieczęć** | Automatyzacja masowa | 1 tyg | 🟡 Średni |
| **Weryfikacja** | Pełna walidacja eIDAS | 1 tyg | 🟢 Niski |

---

## 7. Koszty i Dostawcy

| Dostawca | Typ | Koszt roczny | API | Uwagi |
|----------|-----|--------------|-----|-------|
| **mSzafir (KIR)** | Chmura | od 299 zł | ✅ REST | Rekomendowany |
| **SimplySign** | Chmura | od 250 zł | ✅ REST | Popularny w admin |
| **Certum** | Karta | od 239 zł | ✅ SDK | Najwięcej punktów |
| **mObywatel** | Chmura | **BEZPŁATNY** | ❌ | 5 docs/miesiąc |
| **Pieczęć firmowa** | Karta/HSM | od 500 zł | ✅ | Do automatyzacji |

---

## 8. Następne Kroki

1. **Umowa z KIR** - dostęp do środowiska integracyjnego mSzafir
2. **Implementacja MVP** - adapter mSzafir + UI
3. **Testy z KSeF** - autoryzacja certyfikatami MCU
4. **Dokumentacja** - instrukcje dla użytkowników
5. **Pieczęć firmowa** - automatyzacja dla większych klientów

---

## Podsumowanie

Rozbudowa EXEF o podpis kwalifikowany zapewnia:

✅ **Zgodność z KSeF 2026** - certyfikaty MCU zamiast tokenów  
✅ **Automatyzację** - pieczęć kwalifikowana dla masowego przetwarzania  
✅ **Elastyczność** - wybór dostawcy (mSzafir, SimplySign, karta)  
✅ **Oszczędność** - opcja mObywatel za darmo dla małych firm  
✅ **Bezpieczeństwo** - zgodność z eIDAS, uznawanie w UE
