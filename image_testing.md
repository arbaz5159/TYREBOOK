# TyreBook — AI Invoice OCR testing rules

Follow these rules when validating the Smart Purchase (invoice OCR) flow.

## Image handling
- Always use base64-encoded images for `/api/ocr/invoice` requests.
- Accepted formats: JPEG, PNG, WEBP only. (Do not send SVG / BMP / HEIC.)
- Do NOT send blank, solid-color or uniform images — they yield empty fields.
- Prefer a real supplier invoice photograph with text, lines and columns.
- If an animated GIF/APNG/WEBP arrives, extract the first frame only.
- Resize very large images to something reasonable (~2 MB max) before upload.
- Redetect MIME after any conversion — a `.jpg` extension with PNG bytes is invalid.

## PDF handling
- The mobile client refuses raw PDFs with a hint to upload as image because Expo has no on-device rasteriser.
- To OCR a PDF, convert page 1 to JPEG/PNG on the client (native module) or route the PDF through a server-side rasteriser before calling the model.

## Backend endpoint
- URL: `POST /api/ocr/invoice`
- Payload: `{ image_base64: string, mime_type: string }` (base64 may or may not include the `data:image/...;base64,` prefix)
- Response schema (never omit keys):
```json
{
  "supplier_name": "",
  "invoice_number": "",
  "invoice_date": "",
  "gst_percentage": 0,
  "total_amount": 0,
  "line_items": [
    { "brand": "", "model": "", "size": "", "tube_tubeless": "", "radial_bias": "", "ply_rating": "", "quantity": 0, "purchase_price": 0 }
  ],
  "confidence": {
    "supplier_name": "high|medium|low",
    "invoice_number": "high|medium|low",
    "invoice_date": "high|medium|low",
    "gst_percentage": "high|medium|low",
    "total_amount": "high|medium|low",
    "line_items": "high|medium|low"
  }
}
```
- Model: `openai / gpt-4o-mini` via `emergentintegrations.llm.chat.LlmChat` and the Emergent Universal Key.
- Non-invoice images return all empty strings / zeros with `low` confidence — this is the expected behavior, not a failure.
- Duplicate check: after saving a purchase the client calls `POST /api/purchases/index`; subsequent scans call `POST /api/purchases/check-duplicate` to warn on re-imports.
