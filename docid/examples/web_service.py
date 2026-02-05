#!/usr/bin/env python3
"""
EXEF Document ID Web Service
REST API dla generowania i weryfikacji ID dokumentów
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import tempfile
import os
from pathlib import Path
from typing import Optional, List, Dict, Any
import json
import logging

from exef_docid import (
    process_document,
    generate_universal_document_id,
    verify_universal_document_id,
    compare_universal_documents,
    generate_invoice_id,
    generate_receipt_id,
    generate_contract_id
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="EXEF Document ID API",
    description="REST API dla generowania deterministycznych ID dokumentów",
    version="1.0.0"
)

# Add CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Storage for uploaded files
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "EXEF Document ID API",
        "version": "1.0.0",
        "endpoints": {
            "generate_business": "/generate/business",
            "generate_universal": "/generate/universal",
            "process": "/process",
            "verify": "/verify",
            "compare": "/compare",
            "batch": "/batch",
            "analyze": "/analyze",
            "quality_test": "/quality-test"
        }
    }

@app.post("/generate/business")
async def generate_business_id(
    document_type: str = Form(...),
    nip: str = Form(...),
    number: Optional[str] = Form(None),
    date: str = Form(...),
    amount: Optional[float] = Form(None),
    register: Optional[str] = Form(None),
    party2_nip: Optional[str] = Form(None)
):
    """Generuj ID dokumentu biznesowego"""
    try:
        if document_type == "invoice":
            if not all([nip, number, date, amount]):
                raise HTTPException(400, "Brakujące pola: nip, number, date, amount")
            doc_id = generate_invoice_id(
                seller_nip=nip,
                invoice_number=number,
                issue_date=date,
                gross_amount=amount
            )
        elif document_type == "receipt":
            if not all([nip, date, amount, register]):
                raise HTTPException(400, "Brakujące pola: nip, date, amount, register")
            doc_id = generate_receipt_id(
                seller_nip=nip,
                receipt_date=date,
                gross_amount=amount,
                cash_register_number=register
            )
        elif document_type == "contract":
            if not all([nip, party2_nip, date, number]):
                raise HTTPException(400, "Brakujące pola: nip, party2_nip, date, number")
            doc_id = generate_contract_id(
                party1_nip=nip,
                party2_nip=party2_nip,
                contract_date=date,
                contract_number=number
            )
        else:
            raise HTTPException(400, "Nieznany typ dokumentu")
        
        return {
            "success": True,
            "document_type": document_type,
            "document_id": doc_id
        }
    except Exception as e:
        logger.error(f"Error generating business ID: {e}")
        raise HTTPException(500, str(e))

@app.post("/generate/universal")
async def generate_universal_id(file: UploadFile = File(...)):
    """Generuj uniwersalne ID dokumentu"""
    try:
        # Save uploaded file
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        try:
            # Generate ID
            doc_id = generate_universal_document_id(tmp_path)
            
            return {
                "success": True,
                "filename": file.filename,
                "document_id": doc_id
            }
        finally:
            # Clean up
            os.unlink(tmp_path)
            
    except Exception as e:
        logger.error(f"Error generating universal ID: {e}")
        raise HTTPException(500, str(e))

@app.post("/process")
async def process_document_endpoint(
    file: UploadFile = File(...),
    use_ocr: bool = Form(True),
    format: str = Form("json")
):
    """Przetwarzaj dokument z OCR"""
    try:
        # Save uploaded file
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        try:
            # Process document
            result = process_document(tmp_path, use_ocr=use_ocr)
            
            response = {
                "success": True,
                "filename": file.filename,
                "document_id": result.document_id,
                "document_type": result.document_type.value if result.document_type else None,
                "confidence": result.ocr_confidence,
                "extraction": None
            }
            
            if result.extraction:
                response["extraction"] = {
                    "issuer_nip": result.extraction.issuer_nip,
                    "buyer_nip": result.extraction.buyer_nip,
                    "invoice_number": result.extraction.invoice_number,
                    "document_date": result.extraction.document_date,
                    "gross_amount": result.extraction.gross_amount,
                    "net_amount": result.extraction.net_amount,
                    "vat_amount": result.extraction.vat_amount,
                    "receipt_number": result.extraction.receipt_number,
                    "cash_register_number": result.extraction.cash_register_number,
                    "contract_number": result.extraction.contract_number,
                    "party2_nip": result.extraction.party2_nip,
                    "contract_type": result.extraction.contract_type
                }
            
            ocr_text = result.ocr_result.full_text if result.ocr_result else ""
            if format == "verbose":
                response["ocr_text"] = ocr_text[:1000] + "..." if len(ocr_text) > 1000 else ocr_text
            
            return response
            
        finally:
            # Clean up
            os.unlink(tmp_path)
            
    except Exception as e:
        logger.error(f"Error processing document: {e}")
        raise HTTPException(500, str(e))

@app.post("/verify")
async def verify_document_endpoint(
    file: UploadFile = File(...),
    document_id: str = Form(...),
    universal: bool = Form(False)
):
    """Weryfikuj ID dokumentu"""
    try:
        # Save uploaded file
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        try:
            # Verify ID
            if universal:
                is_valid = verify_universal_document_id(tmp_path, document_id)
            else:
                result = process_document(tmp_path, use_ocr=True)
                is_valid = result.document_id == document_id
            
            return {
                "success": True,
                "filename": file.filename,
                "document_id": document_id,
                "is_valid": is_valid,
                "verification_type": "universal" if universal else "business"
            }
            
        finally:
            # Clean up
            os.unlink(tmp_path)
            
    except Exception as e:
        logger.error(f"Error verifying document: {e}")
        raise HTTPException(500, str(e))

@app.post("/compare")
async def compare_documents_endpoint(
    file1: UploadFile = File(...),
    file2: UploadFile = File(...)
):
    """Porównaj dwa dokumenty"""
    try:
        # Save uploaded files
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file1.filename).suffix) as tmp1:
            content1 = await file1.read()
            tmp1.write(content1)
            tmp1_path = tmp1.name
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file2.filename).suffix) as tmp2:
            content2 = await file2.read()
            tmp2.write(content2)
            tmp2_path = tmp2.name
        
        try:
            # Compare documents
            comparison = compare_universal_documents(tmp1_path, tmp2_path)
            
            return {
                "success": True,
                "file1": file1.filename,
                "file2": file2.filename,
                "comparison": comparison
            }
            
        finally:
            # Clean up
            os.unlink(tmp1_path)
            os.unlink(tmp2_path)
            
    except Exception as e:
        logger.error(f"Error comparing documents: {e}")
        raise HTTPException(500, str(e))

@app.post("/batch")
async def batch_process_endpoint(
    files: List[UploadFile] = File(...),
    use_ocr: bool = Form(True),
    find_duplicates: bool = Form(False)
):
    """Przetwarzaj wsadowe dokumenty"""
    try:
        results = []
        
        for file in files:
            # Save uploaded file
            with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
                content = await file.read()
                tmp.write(content)
                tmp_path = tmp.name
            
            try:
                # Process document
                result = process_document(tmp_path, use_ocr=use_ocr)
                
                results.append({
                    "filename": file.filename,
                    "document_id": result.document_id,
                    "document_type": result.document_type.value if result.document_type else None,
                    "confidence": result.ocr_confidence
                })
                
            finally:
                # Clean up
                os.unlink(tmp_path)
        
        # Find duplicates if requested
        duplicates = []
        if find_duplicates:
            id_counts = {}
            for result in results:
                doc_id = result["document_id"]
                if doc_id not in id_counts:
                    id_counts[doc_id] = []
                id_counts[doc_id].append(result["filename"])
            
            duplicates = [
                {"document_id": doc_id, "files": files}
                for doc_id, files in id_counts.items()
                if len(files) > 1
            ]
        
        return {
            "success": True,
            "processed": len(results),
            "results": results,
            "duplicates": duplicates
        }
        
    except Exception as e:
        logger.error(f"Error in batch processing: {e}")
        raise HTTPException(500, str(e))

@app.post("/analyze")
async def analyze_file_endpoint(file: UploadFile = File(...)):
    """Analizuj cechy pliku"""
    try:
        from exef_docid.document_id_universal import UniversalDocumentIDGenerator
        
        # Save uploaded file
        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        try:
            # Analyze file
            generator = UniversalDocumentIDGenerator()
            features = generator.get_document_features(tmp_path)
            
            return {
                "success": True,
                "filename": file.filename,
                "features": {
                    "file_type": features.file_type,
                    "file_size": features.file_size,
                    "dimensions": features.dimensions,
                    "page_count": features.page_count,
                    "content_hash": features.content_hash,
                    "visual_hash": features.visual_hash,
                    "text_hash": features.text_hash,
                    "metadata_hash": features.metadata_hash,
                    "color_profile_hash": features.color_profile_hash
                }
            }
            
        finally:
            # Clean up
            os.unlink(tmp_path)
            
    except Exception as e:
        logger.error(f"Error analyzing file: {e}")
        raise HTTPException(500, str(e))

@app.post("/quality-test")
async def quality_test_endpoint(
    file: UploadFile = File(...),
    iterations: int = Form(10),
    ocr_engines: List[str] = Form(["paddle", "tesseract"])
):
    """Test jakości generowania ID z różnymi silnikami OCR"""
    try:
        results = {}
        
        for engine in ocr_engines:
            engine_results = []
            
            for i in range(iterations):
                # Save uploaded file
                with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
                    # For quality test, we might want to add some noise
                    content = await file.read()
                    
                    # Add slight variations for testing
                    if i > 0 and engine == "tesseract":
                        # Add minimal noise for robustness testing
                        import numpy as np
                        from PIL import Image
                        import io
                        
                        # Convert to image if possible
                        try:
                            img = Image.open(io.BytesIO(content))
                            
                            # Add very slight noise (1% chance per pixel)
                            img_array = np.array(img)
                            noise = np.random.choice([0, 1], size=img_array.shape, p=[0.99, 0.01])
                            
                            if len(img_array.shape) == 3:
                                noise = np.stack([noise] * img_array.shape[2], axis=-1)
                            
                            img_array = np.where(noise == 1, 255, img_array)
                            noisy_img = Image.fromarray(img_array.astype(np.uint8))
                            
                            # Save noisy image
                            noisy_img.save(tmp, format=img.format or 'PNG')
                            content = None  # Don't use original content
                        except:
                            # If not an image, use original
                            tmp.write(content)
                    else:
                        tmp.write(content)
                    
                    tmp_path = tmp.name
                
                try:
                    # Process with specific OCR engine
                    if engine == "none":
                        # Test without OCR
                        from exef_docid.document_id_universal import generate_universal_document_id
                        doc_id = generate_universal_document_id(tmp_path)
                        confidence = 1.0
                    else:
                        # Process with OCR
                        from exef_docid.ocr_processor import OCREngine
                        from exef_docid.pipeline import process_document
                        
                        result = process_document(
                            tmp_path,
                            use_ocr=True,
                            ocr_engine=OCREngine.PADDLE if engine == "paddle" else OCREngine.TESSERACT
                        )
                        doc_id = result.document_id
                        confidence = result.ocr_confidence
                    
                    engine_results.append({
                        "iteration": i + 1,
                        "document_id": doc_id,
                        "confidence": confidence
                    })
                    
                finally:
                    # Clean up
                    os.unlink(tmp_path)
            
            # Analyze results for this engine
            unique_ids = set(r["document_id"] for r in engine_results)
            avg_confidence = sum(r["confidence"] for r in engine_results) / len(engine_results)
            
            results[engine] = {
                "iterations": iterations,
                "unique_ids": len(unique_ids),
                "deterministic": len(unique_ids) == 1,
                "avg_confidence": avg_confidence,
                "results": engine_results[:3],  # Show first 3 results
                "all_ids": list(unique_ids) if len(unique_ids) <= 5 else f"{len(unique_ids)} unique IDs"
            }
        
        # Summary
        most_deterministic = max(results.keys(), key=lambda k: results[k]["deterministic"])
        highest_confidence = max(results.keys(), key=lambda k: results[k]["avg_confidence"])
        
        return {
            "success": True,
            "filename": file.filename,
            "test_iterations": iterations,
            "results": results,
            "summary": {
                "most_deterministic_engine": most_deterministic,
                "highest_confidence_engine": highest_confidence,
                "recommendation": "Use " + most_deterministic + " for best determinism"
            }
        }
        
    except Exception as e:
        logger.error(f"Error in quality test: {e}")
        raise HTTPException(500, str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "EXEF Document ID API"}

if __name__ == "__main__":
    uvicorn.run(
        "web_service:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
