// Client for /api/ocr/invoice and /api/purchases/*

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";

export interface InvoiceLineItem {
  brand: string;
  model: string;
  size: string;
  tube_tubeless: string;
  radial_bias: string;
  ply_rating: string;
  quantity: number;
  purchase_price: number;
}

export interface InvoiceExtraction {
  supplier_name: string;
  invoice_number: string;
  invoice_date: string;
  gst_percentage: number;
  total_amount: number;
  line_items: InvoiceLineItem[];
  confidence?: Record<string, "high" | "medium" | "low">;
  error?: string;
  raw?: string;
}

export async function scanInvoice(base64: string, mime: string): Promise<InvoiceExtraction> {
  const res = await fetch(`${BASE}/api/ocr/invoice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64: base64, mime_type: mime }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OCR failed (${res.status}): ${t.slice(0, 200)}`);
  }
  return (await res.json()) as InvoiceExtraction;
}

export async function checkDuplicateInvoice(
  invoiceNumber: string,
  supplierName: string,
): Promise<{ duplicate: boolean; match?: any }> {
  if (!invoiceNumber.trim()) return { duplicate: false };
  const res = await fetch(`${BASE}/api/purchases/check-duplicate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoice_number: invoiceNumber, supplier_name: supplierName }),
  });
  if (!res.ok) return { duplicate: false };
  return await res.json();
}

export async function indexPurchase(payload: {
  invoice_number: string;
  supplier_name: string;
  total: number;
  date: string;
}): Promise<void> {
  try {
    await fetch(`${BASE}/api/purchases/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // best-effort
  }
}
