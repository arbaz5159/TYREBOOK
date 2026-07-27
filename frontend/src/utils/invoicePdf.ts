// Professional GST-style invoice PDF generator using expo-print.
// Also exposes WhatsApp / Email share via expo-sharing.

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import type { Sale } from "@/src/constants/inventory";
import type { ShopSettings } from "@/src/firebase/master";

function esc(v: string | number | undefined | null): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export type InvoiceType =
  | "Tax Invoice"
  | "GST Invoice"
  | "Non-GST Invoice"
  | "Estimate"
  | "Quotation"
  | "Delivery Challan"
  | "Purchase Order";

export interface BuildInvoiceOptions {
  invoiceType: InvoiceType;
  invoiceNumber: string;
  sale: Sale;
  shop: ShopSettings;
  upiId?: string; // For QR
}

function upiUri(payee: string, upi: string, amount: number, note: string) {
  const params = new URLSearchParams({
    pa: upi,
    pn: payee,
    am: amount.toFixed(2),
    cu: "INR",
    tn: note,
  });
  return `upi://pay?${params.toString()}`;
}

function qrImg(data: string, size = 140): string {
  // Public QR service — okay for previews; production apps can swap for on-device.
  return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(data)}&size=${size}x${size}`;
}

export function buildInvoiceHtml(opts: BuildInvoiceOptions): string {
  const { sale, shop, invoiceType, invoiceNumber } = opts;
  const subtotal = sale.quantity * sale.sellingPrice;
  const gstAmount = (subtotal * sale.gstPercent) / 100;
  const total = subtotal + gstAmount;
  const isTax = invoiceType === "Tax Invoice" || invoiceType === "GST Invoice";
  const showQR = Boolean(opts.upiId) && sale.paymentMode !== "Credit";
  const qrData = showQR
    ? upiUri(shop.shopName || "TyreBook", opts.upiId!, total, invoiceNumber)
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>${esc(invoiceType)} ${esc(invoiceNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; margin: 0; padding: 24px; color: #1B1F1E; }
  .wrap { max-width: 800px; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #006B5F; padding-bottom: 16px; }
  .brand { font-size: 26px; font-weight: 800; color: #006B5F; }
  .doc-type { text-align: right; }
  .doc-type h1 { margin: 0; font-size: 22px; color: #006B5F; }
  .muted { color: #6F7978; font-size: 12px; }
  .row { display: flex; justify-content: space-between; margin-top: 16px; gap: 16px; }
  .card { flex: 1; padding: 12px; border: 1px solid #DDE5E4; border-radius: 8px; }
  .card h4 { margin: 0 0 6px; font-size: 12px; color: #006B5F; text-transform: uppercase; letter-spacing: 0.5px; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th { background: #CCE8E3; color: #05201C; text-align: left; padding: 10px; font-size: 12px; }
  td { padding: 10px; border-bottom: 1px solid #DDE5E4; font-size: 13px; }
  .totals { margin-top: 12px; margin-left: auto; width: 240px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
  .totals .grand { border-top: 2px solid #006B5F; padding-top: 6px; margin-top: 6px; font-weight: 800; font-size: 15px; color: #006B5F; }
  .foot { margin-top: 30px; padding-top: 20px; border-top: 1px solid #DDE5E4; display: flex; justify-content: space-between; gap: 16px; }
  .qr { text-align: center; }
  .qr img { width: 140px; height: 140px; }
  .qr .cap { font-size: 11px; color: #6F7978; margin-top: 4px; }
  .thanks { font-size: 12px; color: #6F7978; text-align: right; max-width: 280px; }
</style></head>
<body><div class="wrap">
  <div class="head">
    <div>
      <div class="brand">${esc(shop.shopName || "TyreBook")}</div>
      <div class="muted">${esc(shop.address || "")}</div>
      <div class="muted">${esc(shop.phone || "")} · ${esc(shop.email || "")}</div>
      ${isTax && shop.gstin ? `<div class="muted"><b>GSTIN:</b> ${esc(shop.gstin)}</div>` : ""}
      ${shop.panNumber ? `<div class="muted"><b>PAN:</b> ${esc(shop.panNumber)}</div>` : ""}
    </div>
    <div class="doc-type">
      <h1>${esc(invoiceType)}</h1>
      <div class="muted"><b>No.</b> ${esc(invoiceNumber)}</div>
      <div class="muted"><b>Date:</b> ${new Date(sale.date).toLocaleDateString("en-IN")}</div>
    </div>
  </div>

  <div class="row">
    <div class="card">
      <h4>Bill To</h4>
      <div><b>${esc(sale.customerName || "Walk-in customer")}</b></div>
      <div class="muted">${esc(sale.mobileNumber || "")}</div>
      ${sale.vehicleNumber ? `<div class="muted">Vehicle: ${esc(sale.vehicleNumber)}</div>` : ""}
    </div>
    <div class="card">
      <h4>Payment</h4>
      <div><b>${esc(sale.paymentMode)}</b></div>
      <div class="muted">${sale.paymentMode === "Credit" ? "Added to Khata" : "Paid"}</div>
    </div>
  </div>

  <table>
    <thead><tr>
      <th>#</th><th>Description</th><th>Qty</th><th>Rate</th><th style="text-align:right">Amount</th>
    </tr></thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>${esc(sale.brand)} ${esc(sale.model)} — ${esc(sale.size)}</td>
        <td>${sale.quantity}</td>
        <td>${inr(sale.sellingPrice)}</td>
        <td style="text-align:right"><b>${inr(subtotal)}</b></td>
      </tr>
    </tbody>
  </table>

  <div class="totals">
    <div><span>Subtotal</span><span>${inr(subtotal)}</span></div>
    ${isTax ? `<div><span>GST (${sale.gstPercent}%)</span><span>${inr(gstAmount)}</span></div>` : ""}
    <div class="grand"><span>Total</span><span>${inr(total)}</span></div>
  </div>

  <div class="foot">
    ${
      showQR
        ? `<div class="qr">
             <img src="${qrImg(qrData)}" />
             <div class="cap">Scan to pay via UPI</div>
           </div>`
        : `<div></div>`
    }
    <div class="thanks">${esc(shop.invoiceFooter || "Thank you for your business!")}</div>
  </div>
</div></body></html>`;
}

export async function generateAndShareInvoice(opts: BuildInvoiceOptions): Promise<string | null> {
  const html = buildInvoiceHtml(opts);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (!(await Sharing.isAvailableAsync())) {
    if (Platform.OS === "web") return uri; // caller can offer download
    return null;
  }
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: `${opts.invoiceType} ${opts.invoiceNumber}`,
    UTI: "com.adobe.pdf",
  });
  return uri;
}

export async function printInvoice(opts: BuildInvoiceOptions): Promise<void> {
  const html = buildInvoiceHtml(opts);
  await Print.printAsync({ html });
}
