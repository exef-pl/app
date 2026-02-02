"""EXEF Backend - Minimal Document Flow Engine (~200 LOC)"""
from fastapi import FastAPI, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime
from contextlib import asynccontextmanager
import sqlite3, json, asyncio, httpx, uuid

# === Models ===
class Endpoint(BaseModel):
    id: str = None
    type: Literal["email", "ksef", "scanner", "webhook", "wfirma", "printer", "folder"]
    direction: Literal["import", "export"]
    name: str
    config: dict = {}
    active: bool = True

class Document(BaseModel):
    id: str = None
    type: Literal["invoice", "contract", "payment"]
    number: str
    contractor: str = ""
    amount: float = 0
    status: Literal["created", "described", "signed", "exported"] = "created"
    source_endpoint: str = None
    data: dict = {}
    created_at: str = None

class FlowEvent(BaseModel):
    endpoint_id: str
    action: Literal["pull", "push"]
    document_ids: list[str] = []

# === Database ===
def db():
    conn = sqlite3.connect("/data/exef.db", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS endpoints (id TEXT PRIMARY KEY, data JSON);
            CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, data JSON);
            CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, ts TEXT, type TEXT, data JSON);
        """)

# === WebSocket Hub ===
class Hub:
    def __init__(self): self.clients: list[WebSocket] = []
    async def connect(self, ws: WebSocket): await ws.accept(); self.clients.append(ws)
    def disconnect(self, ws: WebSocket): self.clients.remove(ws) if ws in self.clients else None
    async def broadcast(self, msg: dict):
        for ws in self.clients:
            try: await ws.send_json(msg)
            except: self.disconnect(ws)

hub = Hub()

# === Endpoint Adapters ===
async def adapter_pull(ep: dict) -> list[dict]:
    """Pull documents from endpoint"""
    t = ep["type"]
    if t == "webhook":  # Webhook pulls from external URL
        async with httpx.AsyncClient() as c:
            r = await c.get(ep["config"].get("url", ""), timeout=10)
            return r.json() if r.status_code == 200 else []
    if t == "ksef":  # Mock KSeF pull
        return [{"type": "invoice", "number": f"KSEF-{uuid.uuid4().hex[:8]}", "amount": 1000, "contractor": "KSeF Import"}]
    if t == "email":  # Mock email pull
        return [{"type": "invoice", "number": f"EMAIL-{uuid.uuid4().hex[:8]}", "amount": 500, "contractor": "Email Import"}]
    return []

async def adapter_push(ep: dict, docs: list[dict]) -> bool:
    """Push documents to endpoint"""
    t = ep["type"]
    if t == "webhook":  # Webhook pushes to external URL
        async with httpx.AsyncClient() as c:
            r = await c.post(ep["config"].get("url", ""), json=docs, timeout=10)
            return r.status_code < 400
    if t == "wfirma":  # Mock wFirma export - just log
        print(f"[wFirma Export] {len(docs)} documents")
        return True
    if t == "printer":  # Mock print
        print(f"[Print] {len(docs)} documents")
        return True
    return False

# === App ===
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="EXEF", version="1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# === Endpoints CRUD ===
@app.get("/api/endpoints")
def list_endpoints(direction: str = None):
    with db() as conn:
        rows = conn.execute("SELECT data FROM endpoints").fetchall()
    eps = [json.loads(r["data"]) for r in rows]
    return [e for e in eps if not direction or e["direction"] == direction]

@app.post("/api/endpoints")
def create_endpoint(ep: Endpoint):
    ep.id = ep.id or uuid.uuid4().hex[:12]
    with db() as conn:
        conn.execute("INSERT OR REPLACE INTO endpoints VALUES (?, ?)", (ep.id, ep.model_dump_json()))
    return ep

@app.delete("/api/endpoints/{id}")
def delete_endpoint(id: str):
    with db() as conn:
        conn.execute("DELETE FROM endpoints WHERE id = ?", (id,))
    return {"ok": True}

# === Documents CRUD ===
@app.get("/api/documents")
def list_documents(status: str = None, type: str = None):
    with db() as conn:
        rows = conn.execute("SELECT data FROM documents ORDER BY json_extract(data, '$.created_at') DESC").fetchall()
    docs = [json.loads(r["data"]) for r in rows]
    if status: docs = [d for d in docs if d["status"] == status]
    if type: docs = [d for d in docs if d["type"] == type]
    return docs

@app.post("/api/documents")
async def create_document(doc: Document):
    doc.id = doc.id or uuid.uuid4().hex[:12]
    doc.created_at = doc.created_at or datetime.utcnow().isoformat()
    with db() as conn:
        conn.execute("INSERT OR REPLACE INTO documents VALUES (?, ?)", (doc.id, doc.model_dump_json()))
    await hub.broadcast({"event": "document.created", "data": doc.model_dump()})
    return doc

@app.patch("/api/documents/{id}")
async def update_document(id: str, updates: dict):
    with db() as conn:
        row = conn.execute("SELECT data FROM documents WHERE id = ?", (id,)).fetchone()
        if not row: raise HTTPException(404)
        doc = json.loads(row["data"])
        doc.update(updates)
        conn.execute("UPDATE documents SET data = ? WHERE id = ?", (json.dumps(doc), id))
    await hub.broadcast({"event": "document.updated", "data": doc})
    return doc

@app.delete("/api/documents/{id}")
def delete_document(id: str):
    with db() as conn:
        conn.execute("DELETE FROM documents WHERE id = ?", (id,))
    return {"ok": True}

# === Flow Operations ===
@app.post("/api/flow/pull/{endpoint_id}")
async def pull_from_endpoint(endpoint_id: str, bg: BackgroundTasks):
    with db() as conn:
        row = conn.execute("SELECT data FROM endpoints WHERE id = ?", (endpoint_id,)).fetchone()
        if not row: raise HTTPException(404, "Endpoint not found")
    ep = json.loads(row["data"])
    if ep["direction"] != "import": raise HTTPException(400, "Not an import endpoint")
    
    docs = await adapter_pull(ep)
    created = []
    for d in docs:
        doc = Document(type=d.get("type", "invoice"), number=d.get("number", "?"), 
                       contractor=d.get("contractor", ""), amount=d.get("amount", 0),
                       source_endpoint=endpoint_id, data=d)
        created.append(await create_document(doc))
    await hub.broadcast({"event": "flow.pull", "endpoint": endpoint_id, "count": len(created)})
    return {"imported": len(created), "documents": created}

@app.post("/api/flow/push/{endpoint_id}")
async def push_to_endpoint(endpoint_id: str, document_ids: list[str]):
    with db() as conn:
        row = conn.execute("SELECT data FROM endpoints WHERE id = ?", (endpoint_id,)).fetchone()
        if not row: raise HTTPException(404, "Endpoint not found")
        ep = json.loads(row["data"])
        if ep["direction"] != "export": raise HTTPException(400, "Not an export endpoint")
        
        docs = []
        for did in document_ids:
            drow = conn.execute("SELECT data FROM documents WHERE id = ?", (did,)).fetchone()
            if drow: docs.append(json.loads(drow["data"]))
    
    success = await adapter_push(ep, docs)
    if success:
        for doc in docs:
            await update_document(doc["id"], {"status": "exported"})
    await hub.broadcast({"event": "flow.push", "endpoint": endpoint_id, "count": len(docs), "success": success})
    return {"exported": len(docs), "success": success}

# === Webhook Receiver (for external systems to push documents) ===
@app.post("/api/webhook/receive/{endpoint_id}")
async def webhook_receive(endpoint_id: str, payload: dict):
    doc = Document(
        type=payload.get("type", "invoice"),
        number=payload.get("number", f"WH-{uuid.uuid4().hex[:6]}"),
        contractor=payload.get("contractor", "Webhook"),
        amount=payload.get("amount", 0),
        source_endpoint=endpoint_id,
        data=payload
    )
    return await create_document(doc)

# === Stats ===
@app.get("/api/stats")
def get_stats():
    with db() as conn:
        docs = [json.loads(r["data"]) for r in conn.execute("SELECT data FROM documents").fetchall()]
        eps = [json.loads(r["data"]) for r in conn.execute("SELECT data FROM endpoints").fetchall()]
    return {
        "documents": {"total": len(docs), "by_status": {s: len([d for d in docs if d["status"]==s]) for s in ["created","described","signed","exported"]}, "by_type": {t: len([d for d in docs if d["type"]==t]) for t in ["invoice","contract","payment"]}},
        "endpoints": {"import": len([e for e in eps if e["direction"]=="import"]), "export": len([e for e in eps if e["direction"]=="export"])}
    }

# === WebSocket ===
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await hub.connect(ws)
    try:
        while True: await ws.receive_text()
    except WebSocketDisconnect: hub.disconnect(ws)

# === Health ===
@app.get("/health")
def health(): return {"status": "ok", "ts": datetime.utcnow().isoformat()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
