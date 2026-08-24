// TyreBook invoice PDF generator — rebuilt to match professional Indian
// tyre-shop invoice conventions.
//
// Exports:
//   • buildGstInvoiceHtml(opts)   — Full Tax Invoice (mirrors the Dewan-Tyres
//                                   style A4 template with GSTIN, HSN/SAC,
//                                   CGST/SGST or IGST, Bank Details, Declaration
//                                   and Authorised Signatory block).
//   • buildKachaBillHtml(opts)    — Simple "Cash Memo / Kacha Bill" (mirrors
//                                   the Jaggi-Tyre-Shoppe style A4 template).
//   • generateAndShareInvoice     — PDF → share-sheet (auto-picks builder).
//   • generateAndShareKachaBill   — Convenience wrapper for Kacha.
//   • printInvoice                — Native print dialog.
//
// The layout is intentionally black-on-white with bordered tables so the print
// looks identical on Android, iOS and web PDF viewers.

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import type { Sale } from "@/src/constants/inventory";
import type { ShopSettings } from "@/src/firebase/master";
import { amountInWords } from "@/src/utils/amountInWords";

/* --------------------------------- helpers -------------------------------- */

function esc(v: string | number | undefined | null): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

function inr(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/* Vehicle category id → readable label. */
const CATEGORY_LABEL: Record<string, string> = {
  bike: "Bike",
  scooter: "Scooter",
  auto: "Auto Rickshaw",
  car: "Car",
  lcv: "LCV",
  truck: "Truck",
  tractor: "Tractor",
  otr: "OTR / Earthmover",
  bus: "Bus",
};

/* Detect if the sale is inter-state by comparing state codes. */
function isInterstateSale(sale: Sale, shop: ShopSettings): boolean {
  if (typeof sale.isInterstate === "boolean") return sale.isInterstate;
  const shopState = (sale.shopStateCode || shop.stateCode || "").trim();
  const custState = (sale.customerStateCode || "").trim();
  if (!custState || !shopState) return false;
  return custState !== shopState;
}

/* Compact HTML entity for a logo placeholder using the first shop-name letter. */
function logoBlock(shop: ShopSettings, size: number): string {
  if (shop.logoUri) {
    return `<img src="${esc(shop.logoUri)}" style="width:${size}px;height:${size}px;object-fit:contain" />`;
  }
  const letter = ((shop.shopName || "T").trim().charAt(0) || "T").toUpperCase();
  return `<div style="width:${size}px;height:${size}px;border:2px solid #B91C1C;color:#B91C1C;
        display:flex;align-items:center;justify-content:center;font-weight:900;font-size:${Math.floor(size * 0.55)}px;
        font-family:'Impact','Arial Black',sans-serif;border-radius:6px;">${esc(letter)}</div>`;
}

/* ---------------------------------- types --------------------------------- */

export type InvoiceType =
  | "Tax Invoice"
  | "GST Invoice"
  | "Kacha Bill"
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
  upiId?: string;
}

/* ======================================================================== */
/* ==============            GST TAX INVOICE                    =========== */
/* ======================================================================== */

export function buildGstInvoiceHtml(opts: BuildInvoiceOptions): string {
  const { sale, shop, invoiceNumber } = opts;
  const qty = Number(sale.quantity) || 0;
  const rate = Number(sale.priceList) || Number(sale.sellingPrice) || 0;
  const discPerUnit = Number(sale.discountAmount) || 0;
  const discPct = Number(sale.discountPercent) || 0;
  const grossAmount = +(rate * qty).toFixed(2);
  const discountTotal = +(discPerUnit * qty).toFixed(2);
  const taxable = +(grossAmount - discountTotal).toFixed(2);
  const gstPct = Number(sale.gstPercent) || 0;
  const totalGst = +((taxable * gstPct) / 100).toFixed(2);
  const grandTotal = +(taxable + totalGst).toFixed(2);
  const roundedTotal = Math.round(grandTotal);
  const rounding = +(roundedTotal - grandTotal).toFixed(2);
  const interstate = isInterstateSale(sale, shop);
  const cgst = interstate ? 0 : +(totalGst / 2).toFixed(2);
  const sgst = interstate ? 0 : +(totalGst - cgst).toFixed(2);
  const igst = interstate ? totalGst : 0;
  const hsn = sale.hsnCode || shop.hsnCode || "4011";
  const shopStateLine =
    (shop.stateName ? `State Name  : ${shop.stateName}` : "") +
    (shop.stateCode ? `${shop.stateName ? ", Code : " : "State Code : "}${shop.stateCode}` : "");
  const custState =
    (sale.customerStateCode ? `State Code : ${sale.customerStateCode}` : "") ||
    (interstate ? "" : shopStateLine);

  const desc = `${sale.brand ? sale.brand.toUpperCase() : ""}${sale.brand ? " " : ""}${sale.model || ""}${sale.size ? " " + sale.size : ""}`.trim();
  void desc; // legacy single-line description — kept for future single-item fallback rendering
  const categoryLabel = CATEGORY_LABEL[sale.categoryId] || "";
  // Multi-item support: build one row per SaleItem when present, otherwise
  // fall back to the legacy single-line render.
  const gstItems = Array.isArray(sale.items) && sale.items.length > 0
    ? sale.items
    : [{
        brand: sale.brand,
        model: sale.model,
        size: sale.size,
        quantity: qty,
        priceList: rate,
        sellingPrice: rate,
        discountPercent: discPct,
        discountAmount: discPerUnit,
        taxable,
        totalGst,
        lineTotal: grandTotal,
        gstPercent: gstPct,
      }];
  const gstItemsHtml = gstItems
    .map((it, i) => {
      const iDesc = `${(it.brand || "").toUpperCase()}${it.brand ? " " : ""}${it.model || ""}${it.size ? " " + it.size : ""}`.trim() || "Tyre";
      const iQty = Number(it.quantity) || 0;
      const iRate = Number(it.priceList) || Number(it.sellingPrice) || 0;
      const iDiscPct = Number(it.discountPercent) || 0;
      const iTaxable = Number((it as { taxable?: number }).taxable ?? Math.max(0, iQty * iRate * (1 - iDiscPct / 100))) || 0;
      const iGstPct = Number((it as { gstPercent?: number }).gstPercent ?? gstPct) || 0;
      return `<tr>
        <td class="center">${i + 1}</td>
        <td>
          <div><b>${esc(iDesc)}</b></div>
        </td>
        <td class="center">${esc(hsn)}</td>
        <td class="center">${iGstPct}%</td>
        <td class="center">${iQty} Nos.</td>
        <td class="right money">${inr(iRate)}</td>
        <td class="center">Nos.</td>
        <td class="center">${iDiscPct > 0 ? iDiscPct + " %" : "-"}</td>
        <td class="right money">${inr(iTaxable)}</td>
      </tr>`;
    })
    .join("");
  const gstTotalQty = gstItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  const gstFillerCount = Math.max(0, 6 - gstItems.length);

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Tax Invoice ${esc(invoiceNumber)}</title>
<style>
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #000; font-family: "Helvetica Neue", Arial, "Liberation Sans", sans-serif; font-size: 11px; }
  .sheet { width: 100%; }
  .doc-title { text-align: center; font-size: 13px; font-weight: 700; padding: 2px 0 4px; letter-spacing: 0.5px; }
  .doc-title small { font-size: 10px; font-weight: 400; float: right; }
  table.grid { width: 100%; border-collapse: collapse; }
  table.grid th, table.grid td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
  table.grid th { background: #F0F0F0; font-weight: 700; text-align: left; font-size: 10px; }
  .lbl { color: #000; font-weight: 400; font-size: 10px; }
  .val { font-weight: 700; }
  .center { text-align: center; }
  .right { text-align: right; }
  .no-b { border: none !important; padding: 2px 4px !important; }
  .thin td, .thin th { padding: 3px 6px; }
  .items th { text-align: center; background: #F0F0F0; font-size: 10px; }
  .items td { font-size: 11px; }
  .money { font-variant-numeric: tabular-nums; }
  .decl { font-size: 10px; line-height: 1.35; }
  .sig { min-height: 70px; text-align: right; font-size: 10px; }
  .sig .sig-line { border-top: 1px solid #000; margin-top: 40px; padding-top: 2px; font-weight: 700; display: inline-block; min-width: 180px; }
  .footer-note { text-align: center; font-size: 10px; padding: 4px 0; font-style: italic; }
</style>
</head>
<body>
<div class="sheet">

  <div class="doc-title">
    <span style="visibility:hidden">.</span>
    Tax Invoice
    <small>(ORIGINAL FOR RECIPIENT)</small>
  </div>

  <!-- Seller + Invoice metadata -->
  <table class="grid">
    <tr>
      <td rowspan="6" style="width:52%; vertical-align: top;">
        <table style="width:100%; border-collapse: collapse;">
          <tr>
            <td class="no-b" style="width:70px; vertical-align: top;">${logoBlock(shop, 60)}</td>
            <td class="no-b" style="vertical-align: top;">
              <div style="font-size:14px; font-weight:800;">${esc(shop.shopName || "Your Tyre Shop")}</div>
              <div style="font-size:10px;">${esc(shop.address || "")}</div>
              ${shop.gstin ? `<div style="font-size:10px;"><b>GSTIN/UIN</b> : ${esc(shop.gstin)}</div>` : ""}
              ${shopStateLine ? `<div style="font-size:10px;">${esc(shopStateLine)}</div>` : ""}
              ${shop.phone ? `<div style="font-size:10px;">Contact : ${esc(shop.phone)}</div>` : ""}
              ${shop.email ? `<div style="font-size:10px;">E-Mail : ${esc(shop.email)}</div>` : ""}
              ${shop.panNumber ? `<div style="font-size:10px;">PAN : ${esc(shop.panNumber)}</div>` : ""}
            </td>
          </tr>
        </table>
      </td>
      <td style="width:24%"><span class="lbl">Invoice No.</span><br /><span class="val">${esc(invoiceNumber)}</span></td>
      <td style="width:24%"><span class="lbl">Dated</span><br /><span class="val">${fmtDate(sale.date)}</span></td>
    </tr>
    <tr>
      <td><span class="lbl">Delivery Note</span><br />&nbsp;</td>
      <td><span class="lbl">Mode/Terms of Payment</span><br /><span class="val">${esc(sale.paymentMode)}</span></td>
    </tr>
    <tr>
      <td><span class="lbl">Reference No. &amp; Date</span><br />&nbsp;</td>
      <td><span class="lbl">Other References</span><br />&nbsp;</td>
    </tr>
    <tr>
      <td><span class="lbl">Buyer's Order No.</span><br />&nbsp;</td>
      <td><span class="lbl">Dated</span><br />&nbsp;</td>
    </tr>
    <tr>
      <td><span class="lbl">Dispatch Doc No.</span><br />&nbsp;</td>
      <td><span class="lbl">Delivery Note Date</span><br />&nbsp;</td>
    </tr>
    <tr>
      <td><span class="lbl">Dispatched through</span><br />&nbsp;</td>
      <td><span class="lbl">Destination</span><br />${sale.customerStateCode ? esc("State code " + sale.customerStateCode) : "&nbsp;"}</td>
    </tr>
  </table>

  <!-- Buyer block -->
  <table class="grid" style="border-top: none;">
    <tr>
      <td style="width:52%;">
        <div class="lbl">Buyer (Bill to)</div>
        <div style="font-size:12px; font-weight:800;">${esc(sale.customerName || "Walk-in customer")}</div>
        ${sale.customerAddress ? `<div>${esc(sale.customerAddress)}</div>` : ""}
        ${sale.mobileNumber ? `<div>Mobile : ${esc(sale.mobileNumber)}</div>` : ""}
        ${sale.customerGstin ? `<div><b>GSTIN/UIN</b> : ${esc(sale.customerGstin)}</div>` : ""}
        ${custState ? `<div>${esc(custState)}</div>` : ""}
        ${categoryLabel ? `<div>Vehicle Type : <b>${esc(categoryLabel)}</b></div>` : ""}
        ${sale.vehicleNumber ? `<div>Vehicle No. : <b>${esc(sale.vehicleNumber)}</b></div>` : ""}
      </td>
      <td style="width:48%;">
        <div class="lbl">Terms of Delivery</div>
        <div>&nbsp;</div>
        <div>&nbsp;</div>
      </td>
    </tr>
  </table>

  <!-- Line items -->
  <table class="grid items" style="border-top:none;">
    <thead>
      <tr>
        <th class="center" style="width:26px;">Sl<br/>No.</th>
        <th>Description of Goods</th>
        <th class="center" style="width:64px;">HSN/SAC</th>
        <th class="center" style="width:44px;">GST<br/>Rate</th>
        <th class="center" style="width:70px;">Quantity</th>
        <th class="right" style="width:70px;">Rate</th>
        <th class="center" style="width:32px;">per</th>
        <th class="center" style="width:58px;">Disc. %</th>
        <th class="right" style="width:96px;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${gstItemsHtml}
      <!-- filler rows to keep the tabular look -->
      ${Array.from({ length: gstFillerCount })
        .map(
          () => `<tr>
            <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
            <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
          </tr>`,
        )
        .join("")}
      <tr>
        <td colspan="7" class="right"><b>${interstate ? "OUTPUT IGST" : "OUTPUT CGST"}</b></td>
        <td>&nbsp;</td>
        <td class="right money">${inr(interstate ? igst : cgst)}</td>
      </tr>
      ${
        !interstate
          ? `<tr>
              <td colspan="7" class="right"><b>OUTPUT SGST</b></td>
              <td>&nbsp;</td>
              <td class="right money">${inr(sgst)}</td>
            </tr>`
          : ""
      }
      ${
        rounding !== 0
          ? `<tr>
              <td colspan="7" class="right"><b>ROUND OFF</b></td>
              <td>&nbsp;</td>
              <td class="right money">${rounding < 0 ? "(-)" + inr(Math.abs(rounding)) : inr(rounding)}</td>
            </tr>`
          : ""
      }
      <tr>
        <td>&nbsp;</td>
        <td class="right"><b>Total</b></td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td class="center"><b>${gstTotalQty} Nos.</b></td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td class="right money"><b>₹ ${inr(roundedTotal)}</b></td>
      </tr>
    </tbody>
  </table>

  <!-- Amount in words -->
  <table class="grid" style="border-top:none;">
    <tr>
      <td>
        <div class="lbl">Amount Chargeable (in words)</div>
        <div style="font-weight:700;">Indian ${esc(amountInWords(roundedTotal))}</div>
      </td>
      <td class="right" style="width:80px; vertical-align:middle;"><b>E. &amp; O.E.</b></td>
    </tr>
  </table>

  <!-- Tax summary -->
  <table class="grid thin" style="border-top:none;">
    <thead>
      <tr>
        <th rowspan="2" class="center" style="width:35%;">HSN/SAC</th>
        <th rowspan="2" class="center">Taxable<br/>Value</th>
        ${
          interstate
            ? `<th colspan="2" class="center">Integrated Tax</th>`
            : `<th colspan="2" class="center">Central Tax</th>
               <th colspan="2" class="center">State Tax</th>`
        }
        <th rowspan="2" class="center">Total<br/>Tax Amount</th>
      </tr>
      <tr>
        ${
          interstate
            ? `<th class="center">Rate</th><th class="center">Amount</th>`
            : `<th class="center">Rate</th><th class="center">Amount</th>
               <th class="center">Rate</th><th class="center">Amount</th>`
        }
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${esc(hsn)}</td>
        <td class="right money">${inr(taxable)}</td>
        ${
          interstate
            ? `<td class="center">${gstPct}%</td><td class="right money">${inr(igst)}</td>`
            : `<td class="center">${(gstPct / 2).toFixed(2)}%</td><td class="right money">${inr(cgst)}</td>
               <td class="center">${(gstPct / 2).toFixed(2)}%</td><td class="right money">${inr(sgst)}</td>`
        }
        <td class="right money">${inr(totalGst)}</td>
      </tr>
      <tr>
        <td class="right"><b>Total</b></td>
        <td class="right money"><b>${inr(taxable)}</b></td>
        ${
          interstate
            ? `<td>&nbsp;</td><td class="right money"><b>${inr(igst)}</b></td>`
            : `<td>&nbsp;</td><td class="right money"><b>${inr(cgst)}</b></td>
               <td>&nbsp;</td><td class="right money"><b>${inr(sgst)}</b></td>`
        }
        <td class="right money"><b>${inr(totalGst)}</b></td>
      </tr>
    </tbody>
  </table>

  <table class="grid" style="border-top:none;">
    <tr>
      <td><b>Tax Amount (in words) :</b> Indian ${esc(amountInWords(totalGst))}</td>
    </tr>
  </table>

  <!-- Bank + Declaration + Signature -->
  <table class="grid" style="border-top:none;">
    <tr>
      <td style="width:60%; vertical-align:top;">
        ${
          shop.bankName || shop.bankAccountNumber || shop.upiId
            ? `<div class="lbl"><b>Company's Bank Details</b></div>
               ${shop.shopName ? `<div>A/c Holder's Name&nbsp;: <b>${esc(shop.shopName)}</b></div>` : ""}
               ${shop.bankName ? `<div>Bank Name&nbsp;: ${esc(shop.bankName)}</div>` : ""}
               ${shop.bankAccountNumber ? `<div>A/c No.&nbsp;: ${esc(shop.bankAccountNumber)}</div>` : ""}
               ${shop.bankIFSC || shop.bankBranch ? `<div>Branch &amp; IFS Code&nbsp;: ${esc([shop.bankBranch, shop.bankIFSC].filter(Boolean).join(" / "))}</div>` : ""}
               ${shop.upiId ? `<div>UPI ID&nbsp;: ${esc(shop.upiId)}</div>` : ""}`
            : `<div class="lbl">Bank details not configured.</div>`
        }
        <div style="margin-top:8px;" class="decl">
          <b>Declaration</b><br />
          1. ${esc(shop.declaration || "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.")}<br />
          2. Goods once sold will not be taken back or exchanged.<br />
          3. Interest @ 24% p.a. will be charged if payment received after due date.
        </div>
      </td>
      <td style="width:40%; vertical-align:top;">
        <div class="sig">
          <div>for <b>${esc(shop.shopName || "Your Tyre Shop")}</b></div>
          <div class="sig-line">Authorised Signatory${shop.signatureName ? " · " + esc(shop.signatureName) : ""}</div>
        </div>
      </td>
    </tr>
  </table>

  <div class="footer-note">This is a Computer Generated Invoice</div>

</div>
</body></html>`;
}

/* ======================================================================== */
/* ==============            KACHA BILL / CASH MEMO             =========== */
/* ======================================================================== */

export function buildKachaBillHtml(opts: BuildInvoiceOptions): string {
  const { sale, shop, invoiceNumber } = opts;
  const qty = Number(sale.quantity) || 0;
  const rate = Number(sale.sellingPrice) || 0;
  const amount = +(qty * rate).toFixed(2);

  const desc = `${sale.brand ? sale.brand : ""}${sale.model ? " " + sale.model : ""}${sale.size ? " " + sale.size : ""}`.trim() || "Tyre";
  void desc; // legacy — kept for future single-line fallback rendering
  // Multi-item support: if the sale has an `items[]` array we render one row
  // per item; otherwise fall back to the single-line legacy render.
  const items = Array.isArray(sale.items) && sale.items.length > 0
    ? sale.items
    : [{ brand: sale.brand, model: sale.model, size: sale.size, quantity: qty, sellingPrice: rate, lineTotal: amount }];
  const itemsHtml = items
    .map((it, i) => {
      const iDesc = `${it.brand || ""}${it.model ? " " + it.model : ""}${it.size ? " " + it.size : ""}`.trim() || "Tyre";
      const iQty = Number(it.quantity) || 0;
      const iRate = Number(it.sellingPrice) || 0;
      const iAmount = Number((it as { lineTotal?: number }).lineTotal ?? iQty * iRate) || 0;
      return `<tr>
        <td class="center">${i + 1}</td>
        <td><b>${esc(iDesc)}</b></td>
        <td class="center">${iQty}</td>
        <td class="right money">${inr(iRate)}</td>
        <td class="right money">${inr(iAmount)}</td>
      </tr>`;
    })
    .join("");
  const itemsTotalQty = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  const itemsTotalAmount = items.reduce(
    (s, it) => s + (Number((it as { lineTotal?: number }).lineTotal ?? (Number(it.quantity) || 0) * (Number(it.sellingPrice) || 0)) || 0),
    0,
  );
  const paddingRowsCount = Math.max(0, 8 - items.length);

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Bill ${esc(invoiceNumber)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; color: #000; font-family: "Helvetica Neue", Arial, sans-serif; font-size: 12px; }
  .sheet { width: 100%; }
  .title { text-align: center; font-size: 16px; font-weight: 700; padding: 4px 0; letter-spacing: 3px; border-bottom: 1px solid #000; }
  table.grid { width: 100%; border-collapse: collapse; }
  table.grid th, table.grid td { border: 1px solid #000; padding: 6px 8px; vertical-align: top; }
  table.grid th { background: #F5F5F5; font-weight: 700; font-size: 11px; text-align: left; }
  .center { text-align: center; }
  .right { text-align: right; }
  .no-b { border: none !important; padding: 2px !important; }
  .items th { text-align: center; background: #F5F5F5; font-size: 11px; }
  .items td { font-size: 12px; }
  .money { font-variant-numeric: tabular-nums; }
  .footer-note { text-align: center; font-size: 10px; padding: 6px 0; font-style: italic; }
  .decl { font-size: 11px; padding-right: 8px; }
</style>
</head>
<body>
<div class="sheet">

  <div class="title">INVOICE</div>

  <!-- Shop header + Invoice meta -->
  <table class="grid" style="border-top:none;">
    <tr>
      <td style="width:22%; vertical-align: middle; text-align:center;">${logoBlock(shop, 80)}</td>
      <td style="width:58%;">
        <div style="font-size:15px; font-weight:800;">${esc(shop.shopName || "Your Tyre Shop")}</div>
        <div>${esc(shop.address || "")}</div>
        ${shop.phone ? `<div>Contact : ${esc(shop.phone)}</div>` : ""}
        ${shop.email ? `<div>E-Mail : ${esc(shop.email)}</div>` : ""}
        ${shop.gstin ? `<div>GSTIN : ${esc(shop.gstin)}</div>` : ""}
      </td>
      <td style="width:20%; vertical-align: top;">
        <div><b>Invoice Number :</b></div>
        <div style="font-size:14px; font-weight:800;">${esc(invoiceNumber)}</div>
        <div style="margin-top:8px;"><b>Dated :</b></div>
        <div>${fmtDate(sale.date)}</div>
      </td>
    </tr>
  </table>

  <!-- Bill To -->
  <table class="grid" style="border-top:none;">
    <tr>
      <td>
        <div style="font-weight:700;">Bill To:</div>
        <div style="font-size:13px; font-weight:700;">${esc(sale.customerName || "Walk-in customer")}</div>
        ${sale.mobileNumber ? `<div>Phone : ${esc(sale.mobileNumber)}</div>` : ""}
        ${sale.customerAddress ? `<div>Address : ${esc(sale.customerAddress)}</div>` : ""}
        ${sale.vehicleNumber ? `<div>Vehicle No. : <b>${esc(sale.vehicleNumber)}</b></div>` : ""}
      </td>
    </tr>
  </table>

  <!-- Items -->
  <table class="grid items" style="border-top:none;">
    <thead>
      <tr>
        <th class="center" style="width:44px;">SNo</th>
        <th>Particulars</th>
        <th class="center" style="width:100px;">Quantity</th>
        <th class="right" style="width:120px;">Rate(₹)</th>
        <th class="right" style="width:140px;">Amount(₹)</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
      ${Array.from({ length: paddingRowsCount })
        .map(
          () => `<tr>
            <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>
          </tr>`,
        )
        .join("")}
      <tr>
        <td colspan="2" class="right"><b>Total</b></td>
        <td class="center"><b>${itemsTotalQty}</b></td>
        <td>&nbsp;</td>
        <td class="right money"><b>${inr(Math.round(itemsTotalAmount))}</b></td>
      </tr>
    </tbody>
  </table>

  <!-- Amount in words -->
  <table class="grid" style="border-top:none;">
    <tr>
      <td class="right" style="font-style: italic;">
        (${esc(amountInWords(Math.round(itemsTotalAmount)))})
      </td>
    </tr>
  </table>

  <!-- Declaration + Payment Info + Signature -->
  <table class="grid" style="border-top:none;">
    <tr>
      <td style="width:65%; vertical-align: top;" class="decl">
        <div><b>Declaration</b></div>
        <div>${esc(shop.declaration || "We declare that this invoice shows the actual price of the goods/services described and that all items are true and correct.")}</div>
      </td>
      <td style="width:35%; vertical-align: top;">
        <div><b>Payment Info:</b></div>
        <div>Mode of Payment : ${esc(sale.paymentMode)}</div>
        ${shop.upiId ? `<div>UPI : ${esc(shop.upiId)}</div>` : ""}
        <div style="margin-top:22px; text-align:right;">
          <div>For <b>${esc(shop.shopName || "Your Tyre Shop")}</b></div>
          ${shop.signatureName ? `<div style="margin-top:20px;">${esc(shop.signatureName)}</div>` : `<div style="margin-top:20px;">&nbsp;</div>`}
          <div style="border-top:1px solid #000; margin-top:2px; padding-top:2px;">Authorised Signatory</div>
        </div>
      </td>
    </tr>
  </table>

  <div class="footer-note">This is a computer generated document</div>

</div>
</body></html>`;
}

/* ======================================================================== */
/* ==============               unified entry points            =========== */
/* ======================================================================== */

function pickBuilder(opts: BuildInvoiceOptions): (o: BuildInvoiceOptions) => string {
  const kind = opts.sale.invoiceKind || opts.invoiceType;
  if (kind === "Kacha Bill" || kind === "Non-GST Invoice" || opts.invoiceType === "Kacha Bill")
    return buildKachaBillHtml;
  return buildGstInvoiceHtml;
}

export function buildInvoiceHtml(opts: BuildInvoiceOptions): string {
  return pickBuilder(opts)(opts);
}

// A4 page dimensions in points (72dpi). expo-print defaults to US-Letter which
// silently crops A4-designed content and can produce a blank last page on
// Android — the primary root cause of the "blank PDF" bug reported by users.
const A4_WIDTH_PT = 595;
const A4_HEIGHT_PT = 842;

// Opens the generated HTML in a printable browser tab on the WEB preview.
// `Print.printToFileAsync` on web returns an HTML data-URI (not a real PDF)
// that renders blank in some browsers, so we render the HTML directly in a
// new window and trigger the native print dialog. This produces a real
// "Save as PDF" flow via the OS print sheet.
function openHtmlForPrintWeb(html: string, title: string): boolean {
  try {
    const g = globalThis as unknown as {
      window?: {
        open?: (
          u: string,
          t?: string,
          f?: string,
        ) => { document?: Document; focus?: () => void; print?: () => void } | null;
      };
    };
    if (!g.window?.open) return false;
    const win = g.window.open("", "_blank", "width=900,height=1000");
    if (!win || !win.document) return false;
    // Inject the HTML AND an auto-print trigger once the DOM has settled.
    const doc = win.document as unknown as {
      open?: () => void;
      write?: (s: string) => void;
      close?: () => void;
    };
    doc.open?.();
    doc.write?.(
      html.replace(
        "</body>",
        `<script>window.document.title=${JSON.stringify(title)};` +
          `window.addEventListener("load",function(){setTimeout(function(){try{window.focus();window.print();}catch(e){}},250);});` +
          `</script></body>`,
      ),
    );
    doc.close?.();
    return true;
  } catch {
    return false;
  }
}

export async function generateAndShareInvoice(opts: BuildInvoiceOptions): Promise<string | null> {
  const html = pickBuilder(opts)(opts);
  const title = `${opts.invoiceType} ${opts.invoiceNumber}`;
  try {
    if (Platform.OS === "web") {
      // On the web preview we bypass expo-print and use the browser's own
      // print pipeline so the HTML renders exactly as designed with real PDF.
      const ok = openHtmlForPrintWeb(html, title);
      if (!ok) console.warn("[invoicePdf] web print blocked (popup?)");
      return ok ? "web-print" : null;
    }

    // Native (iOS + Android): render into a PDF file with EXPLICIT A4
    // dimensions — the previous blank-PDF bug was caused by expo-print
    // defaulting to 612×792 (US Letter) which cropped the A4-designed layout.
    const result = await Print.printToFileAsync({
      html,
      base64: false,
      width: A4_WIDTH_PT,
      height: A4_HEIGHT_PT,
      margins: { left: 20, right: 20, top: 20, bottom: 20 },
    });
    const uri = result?.uri;
    if (!uri) return null;
    if (!(await Sharing.isAvailableAsync())) return uri;
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: title,
      UTI: "com.adobe.pdf",
    });
    return uri;
  } catch (e) {
    console.warn("[invoicePdf] generateAndShareInvoice failed", e);
    return null;
  }
}

export async function generateAndShareKachaBill(opts: BuildInvoiceOptions): Promise<string | null> {
  return generateAndShareInvoice({ ...opts, invoiceType: "Kacha Bill" });
}

export async function printInvoice(opts: BuildInvoiceOptions): Promise<void> {
  const html = pickBuilder(opts)(opts);
  const title = `${opts.invoiceType} ${opts.invoiceNumber}`;
  try {
    if (Platform.OS === "web") {
      openHtmlForPrintWeb(html, title);
      return;
    }
    // Native: use printAsync with the same A4 dimensions.
    await Print.printAsync({
      html,
      width: A4_WIDTH_PT,
      height: A4_HEIGHT_PT,
    });
  } catch (e) {
    console.warn("[invoicePdf] printInvoice failed", e);
  }
}
