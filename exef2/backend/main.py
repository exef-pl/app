"""EXEF Backend v1.1.0 - Document Flow Engine with Profiles"""
from fastapi import FastAPI, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime
from contextlib import asynccontextmanager
import sqlite3, json, asyncio, httpx, uuid, os

# === Config ===
DB_PATH = os.getenv("EXEF_DB_PATH", os.path.join(os.path.dirname(__file__), "..", "data", "exef.db"))
VERSION = "1.1.0"

# === Models ===
class Profile(BaseModel):
    id: str = None
    name: str
    nip: str
    address: str = ""
    color: str = "#6c5ce7"
    active: bool = True
    created_at: str = None

class Endpoint(BaseModel):
    id: str = None
    profile_id: str = "default"
    type: Literal["email", "ksef", "scanner", "webhook", "wfirma", "printer", "folder"]
    direction: Literal["import", "export"]
    name: str
    config: dict = {}
    active: bool = True

class Document(BaseModel):
    id: str = None
    profile_id: str = "default"
    type: Literal["invoice", "contract", "payment"]
    number: str
    contractor: str = ""
    amount: float = 0
    vat_rate: str = "23%"
    status: Literal["created", "described", "signed", "exported"] = "created"
    category: str = ""
    source_endpoint: str = None
    data: dict = {}
    created_at: str = None

class ProfileDelegate(BaseModel):
    id: str = None
    profile_id: str = None
    delegate_name: str
    delegate_email: str = ""
    delegate_nip: str = ""
    role: Literal["owner", "admin", "editor", "viewer"] = "viewer"
    permissions: dict = {}
    active: bool = True
    created_at: str = None
    updated_at: str = None

# === Database ===
def db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with db() as conn:
        conn.executescript("""
                           CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, data JSON);
                           CREATE TABLE IF NOT EXISTS endpoints (id TEXT PRIMARY KEY, profile_id TEXT, data JSON);
                           CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, profile_id TEXT, data JSON);
                           CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, type TEXT, data JSON);
                           CREATE TABLE IF NOT EXISTS profile_delegates (id TEXT PRIMARY KEY, profile_id TEXT, data JSON);
                           CREATE INDEX IF NOT EXISTS idx_endpoints_profile ON endpoints(profile_id);
                           CREATE INDEX IF NOT EXISTS idx_documents_profile ON documents(profile_id);
                           CREATE INDEX IF NOT EXISTS idx_delegates_profile ON profile_delegates(profile_id);
                           """)
        # Create default profile if none exists
        if not conn.execute("SELECT 1 FROM profiles LIMIT 1").fetchone():
            default = Profile(id="default", name="Moja Firma", nip="0000000000", created_at=datetime.utcnow().isoformat())
            conn.execute("INSERT INTO profiles VALUES (?, ?)", (default.id, default.model_dump_json()))

# === WebSocket Hub ===
class Hub:
    def __init__(self): self.clients: dict[str, list[WebSocket]] = {}  # profile_id -> websockets

    async def connect(self, ws: WebSocket, profile_id: str = "default"):
        await ws.accept()
        self.clients.setdefault(profile_id, []).append(ws)

    def disconnect(self, ws: WebSocket, profile_id: str = "default"):
        if profile_id in self.clients and ws in self.clients[profile_id]:
            self.clients[profile_id].remove(ws)

    async def broadcast(self, msg: dict, profile_id: str = "default"):
        for ws in self.clients.get(profile_id, []) + self.clients.get("*", []):
            try: await ws.send_json(msg)
            except: pass

hub = Hub()

# === Adapters ===
async def adapter_pull(ep: dict) -> list[dict]:
    t = ep["type"]
    if t == "webhook":
        async with httpx.AsyncClient() as c:
            try:
                r = await c.get(ep["config"].get("url", ""), timeout=10)
                return r.json() if r.status_code == 200 else []
            except: return []
    if t == "ksef":
        # TODO: Real KSeF implementation in v1.2.0
        return [{"type": "invoice", "number": f"KSEF-{uuid.uuid4().hex[:8]}", "amount": 1000, "contractor": "KSeF Import", "vat_rate": "23%"}]
    if t == "email":
        # TODO: Real IMAP implementation in v1.3.0
        return [{"type": "invoice", "number": f"EMAIL-{uuid.uuid4().hex[:8]}", "amount": 500, "contractor": "Email Import", "vat_rate": "23%"}]
    return []

async def adapter_push(ep: dict, docs: list[dict]) -> dict:
    t = ep["type"]
    result = {"success": False, "exported": 0, "errors": []}

    if t == "webhook":
        async with httpx.AsyncClient() as c:
            try:
                r = await c.post(ep["config"].get("url", ""), json=docs, timeout=10)
                result["success"] = r.status_code < 400
                result["exported"] = len(docs) if result["success"] else 0
            except Exception as e:
                result["errors"].append(str(e))
    elif t == "wfirma":
        # TODO: Real wFirma CSV export in v1.4.0
        print(f"[wFirma] Exporting {len(docs)} documents")
        result = {"success": True, "exported": len(docs), "errors": []}
    elif t == "ksef":
        # TODO: Real KSeF push in v1.2.0
        print(f"[KSeF] Sending {len(docs)} invoices")
        result = {"success": True, "exported": len(docs), "errors": []}
    elif t == "printer":
        print(f"[Printer] Printing {len(docs)} documents")
        result = {"success": True, "exported": len(docs), "errors": []}

    return result

# === App ===
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="EXEF", version=VERSION, lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# === Profiles ===
@app.get("/api/profiles")
def list_profiles():
    with db() as conn:
        return [json.loads(r["data"]) for r in conn.execute("SELECT data FROM profiles").fetchall()]

@app.post("/api/profiles")
async def create_profile(p: Profile):
    p.id = p.id or uuid.uuid4().hex[:12]
    p.created_at = datetime.utcnow().isoformat()
    with db() as conn:
        conn.execute("INSERT OR REPLACE INTO profiles VALUES (?, ?)", (p.id, p.model_dump_json()))
    await hub.broadcast({"event": "profile.created", "data": p.model_dump()}, "*")
    return p

@app.get("/api/profiles/{id}")
def get_profile(id: str):
    with db() as conn:
        row = conn.execute("SELECT data FROM profiles WHERE id = ?", (id,)).fetchone()
        if not row: raise HTTPException(404)
        return json.loads(row["data"])

@app.patch("/api/profiles/{id}")
async def update_profile(id: str, updates: dict):
    with db() as conn:
        row = conn.execute("SELECT data FROM profiles WHERE id = ?", (id,)).fetchone()
        if not row: raise HTTPException(404)
        p = json.loads(row["data"])
        p.update(updates)
        conn.execute("UPDATE profiles SET data = ? WHERE id = ?", (json.dumps(p), id))
    await hub.broadcast({"event": "profile.updated", "data": p}, "*")
    return p

@app.delete("/api/profiles/{id}")
def delete_profile(id: str):
    if id == "default": raise HTTPException(400, "Cannot delete default profile")
    with db() as conn:
        conn.execute("DELETE FROM profiles WHERE id = ?", (id,))
        conn.execute("DELETE FROM endpoints WHERE profile_id = ?", (id,))
        conn.execute("DELETE FROM documents WHERE profile_id = ?", (id,))
        conn.execute("DELETE FROM profile_delegates WHERE profile_id = ?", (id,))
    return {"ok": True}

# === Profile Delegates ===
@app.get("/api/profiles/{profile_id}/delegates")
def list_delegates(profile_id: str):
    with db() as conn:
        rows = conn.execute("SELECT data FROM profile_delegates WHERE profile_id = ?", (profile_id,)).fetchall()
    return [json.loads(r["data"]) for r in rows]

@app.post("/api/profiles/{profile_id}/delegates")
async def create_delegate(profile_id: str, d: ProfileDelegate):
    d.id = d.id or uuid.uuid4().hex[:12]
    d.profile_id = profile_id
    d.created_at = datetime.utcnow().isoformat()
    d.updated_at = d.created_at
    with db() as conn:
        row = conn.execute("SELECT 1 FROM profiles WHERE id = ?", (profile_id,)).fetchone()
        if not row: raise HTTPException(404, "Profile not found")
        conn.execute("INSERT OR REPLACE INTO profile_delegates VALUES (?, ?, ?)", (d.id, profile_id, d.model_dump_json()))
    await hub.broadcast({"event": "delegate.created", "data": d.model_dump()}, profile_id)
    return d

@app.get("/api/profiles/{profile_id}/delegates/{id}")
def get_delegate(profile_id: str, id: str):
    with db() as conn:
        row = conn.execute("SELECT data FROM profile_delegates WHERE id = ? AND profile_id = ?", (id, profile_id)).fetchone()
        if not row: raise HTTPException(404)
        return json.loads(row["data"])

@app.patch("/api/profiles/{profile_id}/delegates/{id}")
async def update_delegate(profile_id: str, id: str, updates: dict):
    with db() as conn:
        row = conn.execute("SELECT data FROM profile_delegates WHERE id = ? AND profile_id = ?", (id, profile_id)).fetchone()
        if not row: raise HTTPException(404)
        d = json.loads(row["data"])
        d.update(updates)
        d["updated_at"] = datetime.utcnow().isoformat()
        conn.execute("UPDATE profile_delegates SET data = ? WHERE id = ?", (json.dumps(d), id))
    await hub.broadcast({"event": "delegate.updated", "data": d}, profile_id)
    return d

@app.delete("/api/profiles/{profile_id}/delegates/{id}")
async def delete_delegate(profile_id: str, id: str):
    with db() as conn:
        conn.execute("DELETE FROM profile_delegates WHERE id = ? AND profile_id = ?", (id, profile_id))
    await hub.broadcast({"event": "delegate.deleted", "id": id}, profile_id)
    return {"ok": True}

# === Endpoints ===
@app.get("/api/profiles/{profile_id}/endpoints")
def list_endpoints(profile_id: str, direction: str = None):
    with db() as conn:
        rows = conn.execute("SELECT data FROM endpoints WHERE profile_id = ?", (profile_id,)).fetchall()
    eps = [json.loads(r["data"]) for r in rows]
    return [e for e in eps if not direction or e["direction"] == direction]

@app.post("/api/profiles/{profile_id}/endpoints")
async def create_endpoint(profile_id: str, ep: Endpoint):
    ep.id = ep.id or uuid.uuid4().hex[:12]
    ep.profile_id = profile_id
    with db() as conn:
        conn.execute("INSERT OR REPLACE INTO endpoints VALUES (?, ?, ?)", (ep.id, profile_id, ep.model_dump_json()))
    await hub.broadcast({"event": "endpoint.created", "data": ep.model_dump()}, profile_id)
    return ep

@app.delete("/api/profiles/{profile_id}/endpoints/{id}")
async def delete_endpoint(profile_id: str, id: str):
    with db() as conn:
        conn.execute("DELETE FROM endpoints WHERE id = ? AND profile_id = ?", (id, profile_id))
    await hub.broadcast({"event": "endpoint.deleted", "id": id}, profile_id)
    return {"ok": True}

# === Documents ===
@app.get("/api/profiles/{profile_id}/documents")
def list_documents(profile_id: str, status: str = None, type: str = None, limit: int = 100):
    with db() as conn:
        rows = conn.execute(
            "SELECT data FROM documents WHERE profile_id = ? ORDER BY json_extract(data, '$.created_at') DESC LIMIT ?",
            (profile_id, limit)
        ).fetchall()
    docs = [json.loads(r["data"]) for r in rows]
    if status: docs = [d for d in docs if d["status"] == status]
    if type: docs = [d for d in docs if d["type"] == type]
    return docs

@app.post("/api/profiles/{profile_id}/documents")
async def create_document(profile_id: str, doc: Document):
    doc.id = doc.id or uuid.uuid4().hex[:12]
    doc.profile_id = profile_id
    doc.created_at = datetime.utcnow().isoformat()
    with db() as conn:
        conn.execute("INSERT OR REPLACE INTO documents VALUES (?, ?, ?)", (doc.id, profile_id, doc.model_dump_json()))
    await hub.broadcast({"event": "document.created", "data": doc.model_dump()}, profile_id)
    return doc

@app.patch("/api/profiles/{profile_id}/documents/{id}")
async def update_document(profile_id: str, id: str, updates: dict):
    with db() as conn:
        row = conn.execute("SELECT data FROM documents WHERE id = ? AND profile_id = ?", (id, profile_id)).fetchone()
        if not row: raise HTTPException(404)
        doc = json.loads(row["data"])
        doc.update(updates)
        conn.execute("UPDATE documents SET data = ? WHERE id = ?", (json.dumps(doc), id))
    await hub.broadcast({"event": "document.updated", "data": doc}, profile_id)
    return doc

@app.delete("/api/profiles/{profile_id}/documents/{id}")
async def delete_document(profile_id: str, id: str):
    with db() as conn:
        conn.execute("DELETE FROM documents WHERE id = ? AND profile_id = ?", (id, profile_id))
    await hub.broadcast({"event": "document.deleted", "id": id}, profile_id)
    return {"ok": True}

# === Flow ===
@app.post("/api/profiles/{profile_id}/flow/pull/{endpoint_id}")
async def pull_from_endpoint(profile_id: str, endpoint_id: str):
    with db() as conn:
        row = conn.execute("SELECT data FROM endpoints WHERE id = ? AND profile_id = ?", (endpoint_id, profile_id)).fetchone()
        if not row: raise HTTPException(404)
    ep = json.loads(row["data"])
    if ep["direction"] != "import": raise HTTPException(400, "Not an import endpoint")

    raw_docs = await adapter_pull(ep)
    created = []
    for d in raw_docs:
        doc = Document(
            profile_id=profile_id,
            type=d.get("type", "invoice"),
            number=d.get("number", "?"),
            contractor=d.get("contractor", ""),
            amount=d.get("amount", 0),
            vat_rate=d.get("vat_rate", "23%"),
            source_endpoint=endpoint_id,
            data=d
        )
        created.append(await create_document(profile_id, doc))

    # Log event
    with db() as conn:
        conn.execute("INSERT INTO events (ts, type, data) VALUES (?, ?, ?)",
                     (datetime.utcnow().isoformat(), "flow.pull", json.dumps({"endpoint": endpoint_id, "count": len(created)})))

    await hub.broadcast({"event": "flow.pull", "endpoint": endpoint_id, "count": len(created)}, profile_id)
    return {"imported": len(created), "documents": [d.model_dump() for d in created]}

@app.post("/api/profiles/{profile_id}/flow/push/{endpoint_id}")
async def push_to_endpoint(profile_id: str, endpoint_id: str, document_ids: list[str]):
    with db() as conn:
        row = conn.execute("SELECT data FROM endpoints WHERE id = ? AND profile_id = ?", (endpoint_id, profile_id)).fetchone()
        if not row: raise HTTPException(404)
        ep = json.loads(row["data"])
        if ep["direction"] != "export": raise HTTPException(400, "Not an export endpoint")

        docs = []
        for did in document_ids:
            drow = conn.execute("SELECT data FROM documents WHERE id = ? AND profile_id = ?", (did, profile_id)).fetchone()
            if drow: docs.append(json.loads(drow["data"]))

    result = await adapter_push(ep, docs)

    if result["success"]:
        for doc in docs:
            await update_document(profile_id, doc["id"], {"status": "exported"})

    # Log event
    with db() as conn:
        conn.execute("INSERT INTO events (ts, type, data) VALUES (?, ?, ?)",
                     (datetime.utcnow().isoformat(), "flow.push", json.dumps({"endpoint": endpoint_id, **result})))

    await hub.broadcast({"event": "flow.push", "endpoint": endpoint_id, **result}, profile_id)
    return result

# === Webhook Receiver ===
@app.post("/api/webhook/{profile_id}/{endpoint_id}")
async def webhook_receive(profile_id: str, endpoint_id: str, payload: dict):
    doc = Document(
        profile_id=profile_id,
        type=payload.get("type", "invoice"),
        number=payload.get("number", f"WH-{uuid.uuid4().hex[:6]}"),
        contractor=payload.get("contractor", "Webhook"),
        amount=payload.get("amount", 0),
        source_endpoint=endpoint_id,
        data=payload
    )
    return await create_document(profile_id, doc)

# === Stats ===
@app.get("/api/profiles/{profile_id}/stats")
def get_profile_stats(profile_id: str):
    with db() as conn:
        docs = [json.loads(r["data"]) for r in conn.execute("SELECT data FROM documents WHERE profile_id = ?", (profile_id,)).fetchall()]
        eps = [json.loads(r["data"]) for r in conn.execute("SELECT data FROM endpoints WHERE profile_id = ?", (profile_id,)).fetchall()]
    return {
        "documents": {
            "total": len(docs),
            "by_status": {s: len([d for d in docs if d["status"]==s]) for s in ["created","described","signed","exported"]},
            "by_type": {t: len([d for d in docs if d["type"]==t]) for t in ["invoice","contract","payment"]}
        },
        "endpoints": {
            "import": len([e for e in eps if e["direction"]=="import"]),
            "export": len([e for e in eps if e["direction"]=="export"])
        }
    }

@app.get("/api/stats")
def get_global_stats():
    with db() as conn:
        profiles = conn.execute("SELECT COUNT(*) as c FROM profiles").fetchone()["c"]
        documents = conn.execute("SELECT COUNT(*) as c FROM documents").fetchone()["c"]
        endpoints = conn.execute("SELECT COUNT(*) as c FROM endpoints").fetchone()["c"]
    return {"profiles": profiles, "documents": documents, "endpoints": endpoints, "version": VERSION}

# === WebSocket ===
@app.websocket("/ws/{profile_id}")
async def websocket_endpoint(ws: WebSocket, profile_id: str = "default"):
    await hub.connect(ws, profile_id)
    try:
        while True: await ws.receive_text()
    except WebSocketDisconnect:
        hub.disconnect(ws, profile_id)

# === Legacy API (backward compatibility) ===
@app.get("/api/endpoints")
def legacy_list_endpoints(direction: str = None):
    return list_endpoints("default", direction)

@app.post("/api/endpoints")
async def legacy_create_endpoint(ep: Endpoint):
    ep.profile_id = "default"
    return await create_endpoint("default", ep)

@app.delete("/api/endpoints/{id}")
async def legacy_delete_endpoint(id: str):
    return await delete_endpoint("default", id)

@app.get("/api/documents")
def legacy_list_documents(status: str = None, type: str = None):
    return list_documents("default", status, type)

@app.post("/api/documents")
async def legacy_create_document(doc: Document):
    doc.profile_id = "default"
    return await create_document("default", doc)

@app.patch("/api/documents/{id}")
async def legacy_update_document(id: str, updates: dict):
    return await update_document("default", id, updates)

@app.delete("/api/documents/{id}")
async def legacy_delete_document(id: str):
    return await delete_document("default", id)

@app.post("/api/flow/pull/{endpoint_id}")
async def legacy_pull(endpoint_id: str):
    return await pull_from_endpoint("default", endpoint_id)

@app.post("/api/flow/push/{endpoint_id}")
async def legacy_push(endpoint_id: str, document_ids: list[str]):
    return await push_to_endpoint("default", endpoint_id, document_ids)

@app.websocket("/ws")
async def legacy_websocket(ws: WebSocket):
    await websocket_endpoint(ws, "default")

# === Categorization ===
@app.get("/api/categories")
def list_categories():
    """List all available expense categories"""
    from adapters.categorize import CATEGORIES
    return {"categories": CATEGORIES}

@app.post("/api/profiles/{profile_id}/documents/{id}/suggest")
async def suggest_category(profile_id: str, id: str):
    """Get category suggestion for document"""
    from adapters.categorize import suggest_category as _suggest
    with db() as conn:
        row = conn.execute("SELECT data FROM documents WHERE id = ? AND profile_id = ?", (id, profile_id)).fetchone()
        if not row: raise HTTPException(404)
        doc = json.loads(row["data"])
    return _suggest(doc)

@app.post("/api/profiles/{profile_id}/documents/{id}/categorize")
async def categorize_document(profile_id: str, id: str, body: dict):
    """Apply category to document and save to history"""
    from adapters.categorize import save_categorization
    category = body.get("category")
    if not category:
        raise HTTPException(400, "Category required")
    
    with db() as conn:
        row = conn.execute("SELECT data FROM documents WHERE id = ? AND profile_id = ?", (id, profile_id)).fetchone()
        if not row: raise HTTPException(404)
        doc = json.loads(row["data"])
    
    # Save to history for future suggestions
    nip = doc.get("contractor_nip") or doc.get("contractorNip")
    if nip:
        save_categorization(nip, category, id)
    
    # Update document with category
    return await update_document(profile_id, id, {"category": category})

# === Export ===
@app.get("/api/export/formats")
def list_export_formats():
    """List available export formats"""
    return {
        "formats": [
            {"id": "wfirma", "name": "wFirma (CSV)", "type": "csv"},
            {"id": "jpk_pkpir", "name": "JPK_PKPIR (XML)", "type": "xml"},
            {"id": "comarch", "name": "Comarch Optima (XML)", "type": "xml"},
            {"id": "symfonia", "name": "Symfonia (CSV)", "type": "csv"},
            {"id": "enova", "name": "enova365 (XML)", "type": "xml"},
        ]
    }

@app.post("/api/profiles/{profile_id}/export/{format}")
async def export_documents(profile_id: str, format: str, body: dict = None):
    """Export documents to specified format"""
    from adapters import get_adapter
    from adapters.export import WFirmaAdapter, JPKPKPIRAdapter, ComarchAdapter, SymfoniaAdapter, EnovaAdapter
    
    # Get documents to export
    doc_ids = body.get("document_ids") if body else None
    with db() as conn:
        if doc_ids:
            placeholders = ",".join("?" * len(doc_ids))
            rows = conn.execute(f"SELECT data FROM documents WHERE id IN ({placeholders}) AND profile_id = ?", 
                              (*doc_ids, profile_id)).fetchall()
        else:
            # Export all signed/approved documents
            rows = conn.execute(
                "SELECT data FROM documents WHERE profile_id = ? AND json_extract(data, '$.status') IN ('signed', 'exported')",
                (profile_id,)
            ).fetchall()
    
    docs = [json.loads(r["data"]) for r in rows]
    
    if not docs:
        raise HTTPException(400, "No documents to export")
    
    # Get profile info for export config
    with db() as conn:
        profile_row = conn.execute("SELECT data FROM profiles WHERE id = ?", (profile_id,)).fetchone()
        profile = json.loads(profile_row["data"]) if profile_row else {}
    
    config = {
        "nip": profile.get("nip", ""),
        "company_name": profile.get("name", ""),
        **(body or {})
    }
    
    # Get appropriate adapter
    adapter = get_adapter(format, config)
    result = await adapter.push(docs)
    
    if not result.success:
        raise HTTPException(500, f"Export failed: {', '.join(result.errors)}")
    
    return {
        "success": True,
        "format": format,
        "count": result.count,
        "content": result.metadata.get("csv_content") or result.metadata.get("xml_content"),
        "filename": result.metadata.get("filename"),
        "totals": result.metadata.get("totals")
    }

# === OCR Processing ===
@app.post("/api/profiles/{profile_id}/documents/{id}/ocr")
async def process_document_ocr(profile_id: str, id: str, body: dict = None):
    """Process document with OCR to extract invoice data"""
    from adapters import get_adapter
    
    with db() as conn:
        row = conn.execute("SELECT data FROM documents WHERE id = ? AND profile_id = ?", (id, profile_id)).fetchone()
        if not row: raise HTTPException(404)
        doc = json.loads(row["data"])
    
    provider = (body or {}).get("provider", "ocr_mock")
    config = (body or {}).get("config", {})
    
    adapter = get_adapter(provider, config)
    result = await adapter.push([doc])
    
    if not result.success:
        raise HTTPException(500, f"OCR failed: {', '.join(result.errors)}")
    
    if result.documents:
        processed = result.documents[0]
        # Update document with OCR results
        return await update_document(profile_id, id, {
            "number": processed.get("number"),
            "contractor_nip": processed.get("contractor_nip"),
            "amount": processed.get("amount"),
            "ocr_data": processed.get("ocr_data"),
            "ocr_confidence": processed.get("ocr_confidence"),
        })
    
    return doc

# === File Upload ===
from fastapi import UploadFile, File
import base64

@app.post("/api/profiles/{profile_id}/upload")
async def upload_file(profile_id: str, file: UploadFile = File(...)):
    """Upload file and create document with OCR processing"""
    from adapters import get_adapter
    
    # Read file content
    content = await file.read()
    content_b64 = base64.b64encode(content).decode()
    
    # Create document from upload
    doc_id = str(uuid.uuid4())
    doc = {
        "id": doc_id,
        "profile_id": profile_id,
        "type": "invoice",
        "number": "",
        "contractor": "",
        "amount": 0,
        "status": "created",
        "source": "upload",
        "attachment_filename": file.filename,
        "attachment_mime": file.content_type,
        "attachment_content": content_b64,
        "created_at": datetime.utcnow().isoformat()
    }
    
    # Save document
    with db() as conn:
        conn.execute("INSERT INTO documents (id, profile_id, data) VALUES (?, ?, ?)",
                    (doc_id, profile_id, json.dumps(doc)))
    
    # Process with mock OCR
    adapter = get_adapter("ocr_mock", {})
    result = await adapter.push([doc])
    
    if result.success and result.documents:
        processed = result.documents[0]
        # Update document with OCR results
        updates = {
            "number": processed.get("number") or doc["number"],
            "contractor_nip": processed.get("contractor_nip"),
            "amount": processed.get("amount") or doc["amount"],
            "ocr_data": processed.get("ocr_data"),
            "ocr_confidence": processed.get("ocr_confidence"),
        }
        with db() as conn:
            row = conn.execute("SELECT data FROM documents WHERE id = ?", (doc_id,)).fetchone()
            existing = json.loads(row["data"])
            existing.update(updates)
            conn.execute("UPDATE documents SET data = ? WHERE id = ?", (json.dumps(existing), doc_id))
        doc.update(updates)
    
    await hub.broadcast({"event": "upload", "document_id": doc_id}, profile_id)
    return doc

# === Adapters Info ===
@app.get("/api/adapters")
def list_adapters():
    """List available adapters"""
    from adapters import list_adapters as _list
    return {"adapters": _list()}

# === Health ===
@app.get("/health")
def health():
    return {"status": "ok", "version": VERSION, "ts": datetime.utcnow().isoformat()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
