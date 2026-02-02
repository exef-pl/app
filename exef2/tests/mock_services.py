"""EXEF Mock Services Server
Mocks all external APIs for E2E testing:
- KSeF API
- Email/IMAP
- OCR Services
- Signature Providers
"""

import asyncio
import base64
import hashlib
import json
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, List

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import uvicorn

# Configuration
MOCK_PORT = 8888
MOCK_HOST = "0.0.0.0"

app = FastAPI(title="EXEF Mock Services", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Storage for mock data
mock_data = {
    "ksef": {
        "sessions": {},
        "invoices": {},
        "uploads": {}
    },
    "email": {
        "messages": [],
        "folders": ["INBOX", "SENT", "DRAFTS"]
    },
    "ocr": {
        "results": {}
    },
    "signature": {
        "certificates": [
            {
                "id": "MOCK-CERT-001",
                "subject": "CN=Jan Kowalski, SERIALNUMBER=PESEL:12345678901, O=FIRMA TEST",
                "issuer": "CN=EXEF Test CA",
                "valid_from": "2025-01-01T00:00:00Z",
                "valid_to": "2026-01-01T00:00:00Z",
                "type": "qualified",
                "usage": ["digital_signature", "key_encipherment"]
            }
        ],
        "signatures": {},
        "sessions": {}
    }
}

# ===================
# KSeF Mock API
# ===================

@app.post("/api/v1/oauth/token")
async def ksef_oauth_token():
    """Mock KSeF OAuth token endpoint"""
    return {
        "access_token": "mock-ksef-token-" + str(int(time.time())),
        "token_type": "Bearer",
        "expires_in": 3600
    }

@app.post("/api/v1/invoices")
async def ksef_upload_invoice(request: Request):
    """Mock KSeF invoice upload"""
    data = await request.json()
    invoice_id = f"KSEF-{int(time.time())}"
    
    mock_data["ksef"]["invoices"][invoice_id] = {
        "id": invoice_id,
        "status": "accepted",
        "uploaded_at": datetime.utcnow().isoformat(),
        "data": data
    }
    
    return {
        "elementReferenceNumber": invoice_id,
        "processingCode": 200,
        "processingDescription": "OK",
        "invoiceStatus": {
            "invoiceStatus": {
                "invoiceStatus": "ACK",
                "processingCode": 200,
                "processingDescription": "OK"
            }
        }
    }

@app.get("/api/v1/invoices/{invoice_id}")
async def ksef_get_invoice(invoice_id: str):
    """Mock KSeF get invoice"""
    if invoice_id not in mock_data["ksef"]["invoices"]:
        raise HTTPException(404, "Invoice not found")
    
    return mock_data["ksef"]["invoices"][invoice_id]

@app.post("/api/v1/invoices/query")
async def ksef_query_invoices(request: Request):
    """Mock KSeF query invoices"""
    data = await request.json()
    
    # Return mock invoices
    return {
        "invoices": [
            {
                "ksefReferenceNumber": k,
                "invoiceStatus": "ACK",
                "processingDescription": "OK"
            }
            for k in mock_data["ksef"]["invoices"].keys()
        ]
    }

# ===================
# Email/IMAP Mock API
# ===================

@app.get("/imap/folders")
async def imap_folders():
    """Mock IMAP folders"""
    return {
        "folders": mock_data["email"]["folders"]
    }

@app.get("/imap/messages")
async def imap_messages(folder: str = "INBOX"):
    """Mock IMAP messages"""
    # Add some test messages
    if not mock_data["email"]["messages"]:
        mock_data["email"]["messages"] = [
            {
                "id": "1",
                "from": "faktura@example.com",
                "subject": "Faktura VAT/2024/001",
                "date": datetime.utcnow().isoformat(),
                "has_attachments": True,
                "folder": "INBOX"
            },
            {
                "id": "2", 
                "from": "umowa@example.com",
                "subject": "Umowa o współpracy",
                "date": (datetime.utcnow() - timedelta(days=1)).isoformat(),
                "has_attachments": True,
                "folder": "INBOX"
            }
        ]
    
    return {
        "messages": [m for m in mock_data["email"]["messages"] if m["folder"] == folder]
    }

@app.get("/imap/messages/{message_id}")
async def imap_message(message_id: str):
    """Mock IMAP message details"""
    msg = next((m for m in mock_data["email"]["messages"] if m["id"] == message_id), None)
    if not msg:
        raise HTTPException(404, "Message not found")
    
    # Add mock attachment
    msg["attachments"] = [
        {
            "name": "faktura.pdf",
            "size": 12345,
            "content_type": "application/pdf"
        }
    ] if msg["has_attachments"] else []
    
    return msg

@app.get("/imap/messages/{message_id}/attachments/{attachment_name}")
async def imap_attachment(message_id: str, attachment_name: str):
    """Mock IMAP attachment download"""
    # Return mock PDF content
    pdf_content = b"%PDF-1.4\nMock PDF content for testing"
    
    return Response(
        content=pdf_content,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={attachment_name}"}
    )

# ===================
# OCR Mock API
# ===================

@app.post("/ocr/extract")
async def ocr_extract(request: Request):
    """Mock OCR extraction"""
    data = await request.json()
    
    # Generate mock OCR result based on document type
    doc_type = data.get("document_type", "invoice")
    
    if doc_type == "invoice":
        result = {
            "document_type": "invoice",
            "confidence": 0.95,
            "fields": {
                "number": "FV/2024/001",
                "date": "2024-01-15",
                "seller": {
                    "name": "FIRMA TESTOWA Sp. z o.o.",
                    "nip": "1234567890",
                    "address": "ul. Testowa 1, 00-123 Warszawa"
                },
                "buyer": {
                    "name": "Klient Testowy",
                    "nip": "9878701234"
                },
                "amount": {
                    "netto": 1000.00,
                    "vat": 230.00,
                    "brutto": 1230.00
                },
                "items": [
                    {
                        "name": "Usługa testowa",
                        "quantity": 1,
                        "unit": "szt.",
                        "price_netto": 1000.00,
                        "vat_rate": "23%"
                    }
                ]
            }
        }
    else:
        result = {
            "document_type": "unknown",
            "confidence": 0.80,
            "text": "Mock OCR text content for document"
        }
    
    # Store result
    result_id = hashlib.md5(json.dumps(data).encode()).hexdigest()
    mock_data["ocr"]["results"][result_id] = result
    
    return result

# ===================
# Signature Mock API
# ===================

@app.post("/signature/oauth/token")
async def signature_oauth_token():
    """Mock signature provider OAuth"""
    return {
        "access_token": "mock-sig-token-" + str(int(time.time())),
        "token_type": "Bearer",
        "expires_in": 3600
    }

@app.post("/signature/certificates/list")
async def signature_certificates():
    """Mock certificates list"""
    return {
        "certificates": mock_data["signature"]["certificates"]
    }

@app.post("/signature/signing/init")
async def signature_signing_init(request: Request):
    """Mock signing session init"""
    data = await request.json()
    session_id = f"SIG-SESSION-{int(time.time())}"
    
    mock_data["signature"]["sessions"][session_id] = {
        "id": session_id,
        "status": "pending",
        "document": data.get("document"),
        "created_at": datetime.utcnow().isoformat()
    }
    
    return {
        "sessionId": session_id,
        "authorizationUrl": "mock://authorize/" + session_id,
        "status": "pending"
    }

@app.get("/signature/signing/status/{session_id}")
async def signature_signing_status(session_id: str):
    """Mock signing status check"""
    if session_id not in mock_data["signature"]["sessions"]:
        raise HTTPException(404, "Session not found")
    
    session = mock_data["signature"]["sessions"][session_id]
    
    # Simulate completion after 2 seconds
    if time.time() - datetime.fromisoformat(session["created_at"]).timestamp() > 2:
        session["status"] = "completed"
        
        # Create mock signature
        signature_id = f"MOCK-SIG-{int(time.time())}"
        mock_data["signature"]["signatures"][signature_id] = {
            "id": signature_id,
            "session_id": session_id,
            "signer": {
                "name": "Jan Kowalski",
                "nip": "1234567890",
                "certificate": "MOCK-CERT-001"
            },
            "timestamp": datetime.utcnow().isoformat()
        }
        
        return {
            "status": "completed",
            "signatureId": signature_id,
            "signedDocument": session.get("document"),  # Mock: return original
            "signerInfo": mock_data["signature"]["signatures"][signature_id]["signer"],
            "timestamp": mock_data["signature"]["signatures"][signature_id]["timestamp"]
        }
    
    return {
        "status": "pending",
        "message": "Waiting for authorization"
    }

@app.post("/signature/verification/verify")
async def signature_verify(request: Request):
    """Mock signature verification"""
    data = await request.json()
    
    return {
        "valid": True,
        "signatures": [
            {
                "signer": "Jan Kowalski",
                "certificate": "MOCK-CERT-001",
                "valid_from": "2025-01-01T00:00:00Z",
                "valid_to": "2026-01-01T00:00:00Z",
                "signature_type": "qualified",
                "level": "T"
            }
        ],
        "timestamps": [
            {
                "ts": "MOCK TSA " + datetime.utcnow().isoformat(),
                "timestamp": datetime.utcnow().isoformat()
            }
        ],
        "certificate_chain": ["MOCK-ROOT-CA", "MOCK-INTERMEDIATE-CA", "MOCK-CERT-001"]
    }

# ===================
# Management Endpoints
# ===================

@app.get("/")
async def root():
    """Mock services status"""
    return {
        "service": "EXEF Mock Services",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "endpoints": {
            "ksef": "/api/v1/*",
            "email": "/imap/*",
            "ocr": "/ocr/*",
            "signature": "/signature/*"
        }
    }

@app.get("/reset")
async def reset_mock_data():
    """Reset all mock data"""
    global mock_data
    mock_data = {
        "ksef": {"sessions": {}, "invoices": {}, "uploads": {}},
        "email": {"messages": [], "folders": ["INBOX", "SENT", "DRAFTS"]},
        "ocr": {"results": {}},
        "signature": {
            "certificates": mock_data["signature"]["certificates"],
            "signatures": {},
            "sessions": {}
        }
    }
    return {"status": "reset"}

@app.get("/status")
async def get_status():
    """Get current mock data status"""
    return {
        "ksef": {
            "invoices": len(mock_data["ksef"]["invoices"]),
            "sessions": len(mock_data["ksef"]["sessions"])
        },
        "email": {
            "messages": len(mock_data["email"]["messages"])
        },
        "ocr": {
            "results": len(mock_data["ocr"]["results"])
        },
        "signature": {
            "certificates": len(mock_data["signature"]["certificates"]),
            "signatures": len(mock_data["signature"]["signatures"]),
            "sessions": len(mock_data["signature"]["sessions"])
        }
    }

if __name__ == "__main__":
    print(f"Starting EXEF Mock Services on {MOCK_HOST}:{MOCK_PORT}")
    uvicorn.run(app, host=MOCK_HOST, port=MOCK_PORT)
