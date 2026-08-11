from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import json
import base64
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------- Existing status check demo endpoints ----------
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.utcnow())


class StatusCheckCreate(BaseModel):
    client_name: str


@api_router.get("/")
async def root():
    return {"message": "TyreBook API"}


@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_obj = StatusCheck(**input.dict())
    await db.status_checks.insert_one(status_obj.dict())
    return status_obj


@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    docs = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    return [StatusCheck(**d) for d in docs]


# ---------- AI: Smart Invoice Scanner ----------
class InvoiceLineItem(BaseModel):
    brand: str = ""
    model: str = ""
    size: str = ""
    tube_tubeless: str = ""
    radial_bias: str = ""
    ply_rating: str = ""
    quantity: float = 0
    purchase_price: float = 0


class InvoiceExtraction(BaseModel):
    supplier_name: str = ""
    invoice_number: str = ""
    invoice_date: str = ""
    gst_percentage: float = 0
    total_amount: float = 0
    line_items: List[InvoiceLineItem] = []
    confidence: dict = Field(default_factory=dict)  # field_name -> "high"/"medium"/"low"
    raw_text: str = ""


class ScanInvoiceRequest(BaseModel):
    image_base64: str  # data:image/jpeg;base64,...  OR just base64
    mime_type: Optional[str] = "image/jpeg"


OCR_SYSTEM_PROMPT = """You are an expert at extracting structured data from Indian tyre-shop supplier invoices.
You receive an image of a paper invoice (or a PDF page rendered to image).
Extract every relevant field and return ONLY valid JSON (no markdown, no prose) matching this schema:

{
  "supplier_name": string,
  "invoice_number": string,
  "invoice_date": string (DD-MM-YYYY),
  "gst_percentage": number (0/5/12/18/28),
  "total_amount": number,
  "line_items": [
    {
      "brand": string,
      "model": string,
      "size": string,
      "tube_tubeless": "Tube" | "Tubeless" | "",
      "radial_bias": "Radial" | "Bias" | "",
      "ply_rating": string,
      "quantity": number,
      "purchase_price": number
    }
  ],
  "confidence": {
     "supplier_name": "high"|"medium"|"low",
     "invoice_number": "high"|"medium"|"low",
     "invoice_date": "high"|"medium"|"low",
     "gst_percentage": "high"|"medium"|"low",
     "total_amount": "high"|"medium"|"low",
     "line_items": "high"|"medium"|"low"
  }
}

Rules:
- If a field cannot be found, return "" (empty string) or 0 — never omit the key.
- Use LOW confidence when the value is unclear or partially occluded.
- The invoice is Indian (Rupees). Ignore prefix like "Rs.", "₹" when producing numbers.
- Tyre size formats look like "205/55 R16", "295/80 R22.5", "8.25x20".
- Never return markdown fences.
"""


@api_router.post("/ocr/invoice")
async def scan_invoice(payload: ScanInvoiceRequest):
    """Send invoice image to vision LLM and return structured extraction."""
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured on backend.")

    b64 = payload.image_base64.split(",")[-1].strip()
    if not b64:
        raise HTTPException(status_code=400, detail="Empty image payload")

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"emergentintegrations not available: {e}")

    session_id = f"ocr-{uuid.uuid4().hex}"
    chat = LlmChat(
        api_key=api_key,
        session_id=session_id,
        system_message=OCR_SYSTEM_PROMPT,
    ).with_model("openai", "gpt-4o-mini")

    image = ImageContent(image_base64=b64)
    user_msg = UserMessage(
        text="Extract the invoice data as strict JSON per the schema.",
        file_contents=[image],
    )

    text = ""
    try:
        # send_message is allowed for explicit non-streaming JSON tasks
        text = await chat.send_message(user_msg)
    except Exception as e:
        logger.exception("LLM call failed")
        raise HTTPException(status_code=502, detail=f"LLM call failed: {e}")

    # Clean the response — sometimes models still wrap with ```json ... ```
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        data = json.loads(cleaned)
    except Exception:
        # Fallback: try to find the first JSON object
        m = re.search(r"\{[\s\S]*\}", cleaned)
        if not m:
            return {"error": "Could not parse model output", "raw": text}
        try:
            data = json.loads(m.group(0))
        except Exception as e:
            return {"error": f"Parse failed: {e}", "raw": text}

    # Store the raw OCR call for audit
    await db.ocr_calls.insert_one({
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "created_at": datetime.utcnow().isoformat(),
        "model": "gpt-4o-mini",
        "response_summary": {
            "supplier_name": data.get("supplier_name"),
            "invoice_number": data.get("invoice_number"),
            "total_amount": data.get("total_amount"),
        },
    })

    return data


# ----- Duplicate invoice check (used by the confirm step) -----
class DupCheck(BaseModel):
    invoice_number: str
    supplier_name: str = ""


@api_router.post("/purchases/check-duplicate")
async def check_duplicate_invoice(payload: DupCheck):
    if not payload.invoice_number.strip():
        return {"duplicate": False}
    q = {"invoice_number": payload.invoice_number.strip()}
    if payload.supplier_name.strip():
        q["supplier_name"] = payload.supplier_name.strip()
    doc = await db.purchase_index.find_one(q, {"_id": 0})
    return {"duplicate": doc is not None, "match": doc}


class IndexPurchase(BaseModel):
    invoice_number: str
    supplier_name: str = ""
    total: float = 0
    date: str = ""


@api_router.post("/purchases/index")
async def index_purchase(payload: IndexPurchase):
    """Client calls this after saving a purchase so we can dedupe future scans."""
    if not payload.invoice_number.strip():
        return {"ok": False}
    await db.purchase_index.update_one(
        {"invoice_number": payload.invoice_number.strip(), "supplier_name": payload.supplier_name.strip()},
        {"$set": {**payload.dict(), "updated_at": datetime.utcnow().isoformat()}},
        upsert=True,
    )
    return {"ok": True}


app.include_router(api_router)

# ---------- OEM fitment sub-router (Phase 1: read-only) ----------
try:
    from oem_router import build_router as _build_oem_router
    _oem_router = _build_oem_router(db)
    # mount under /api/oem/* so the existing Kubernetes ingress rule
    # (which forwards /api → backend) covers it automatically.
    app.include_router(_oem_router, prefix="/api")
except Exception as _oem_err:  # noqa: BLE001
    # Never fail the whole app if the OEM module has a config issue —
    # keep the rest of the API alive and log for debugging.
    logging.getLogger("uvicorn.error").exception(
        "OEM router failed to mount: %s", _oem_err
    )
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
