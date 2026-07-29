const fs = require('fs');
const ts = require('/app/frontend/node_modules/typescript');

function transpile(src) {
  return ts.transpileModule(src, { compilerOptions:{ module:'commonjs', target:'ES2019', esModuleInterop:true }}).outputText;
}

const awSrc = transpile(fs.readFileSync('/app/frontend/src/utils/amountInWords.ts','utf8'));
const awMod = {exports:{}}; new Function('module','exports', awSrc)(awMod, awMod.exports);
const { amountInWords } = awMod.exports;

let invSrc = fs.readFileSync('/app/frontend/src/utils/invoicePdf.ts','utf8')
  .replace(/import \* as Print from "expo-print";/, 'const Print = {};')
  .replace(/import \* as Sharing from "expo-sharing";/, 'const Sharing = {};')
  .replace(/import \{ Platform \} from "react-native";/, 'const Platform = { OS: "web" };')
  .replace(/import type \{ Sale \} from "@\/src\/constants\/inventory";/, '')
  .replace(/import type \{ ShopSettings \} from "@\/src\/firebase\/master";/, '')
  .replace(/import \{ amountInWords \} from "@\/src\/utils\/amountInWords";/, 'const { amountInWords } = require("_aw");');

const invJs = transpile(invSrc);
const invMod = {exports:{}};
const req = (p) => { if (p === '_aw') return { amountInWords }; return require(p); };
new Function('module','exports','require', invJs)(invMod, invMod.exports, req);
const { buildGstInvoiceHtml, buildKachaBillHtml } = invMod.exports;

const shop = {
  shopName: "Sri Krishna Tyres",
  ownerName: "Krishna",
  address: "45 MG Road, Fatima Nagar, Pune 411013",
  phone: "9876543210", email: "krishna@srktyres.in",
  gstin: "27AAAPL1234C1Z9", panNumber: "AAAPL1234C",
  invoicePrefix: "SKT", nextInvoiceNumber: "0002",
  kachaPrefix: "CM", nextKachaNumber: "0002",
  invoiceFooter: "This is a computer generated document",
  hsnCode: "4011",
  stateCode: "27", stateName: "Maharashtra",
  bankName: "State Bank of India",
  bankAccountNumber: "1234 5678 9012",
  bankIFSC: "SBIN0001234",
  bankBranch: "Pune Fatima Nagar",
  upiId: "krishna@upi",
  declaration: "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.",
  signatureName: "Krishna Iyer",
};

const gstSale = {
  id: "1", customerName: "M/S SS Enterprises", mobileNumber: "9520894011",
  customerAddress: "01, Shaikh Main Road, Sufiya Masjid, Latur, Maharashtra 413512",
  customerGstin: "27KWLPS9213L1ZJ", customerStateCode: "29",
  shopStateCode: "27", isInterstate: true,
  vehicleNumber: "KA05FT1273", customerType: "Wholesale", date: Date.now(),
  categoryId: "truck", tyreClass: "new",
  brand: "MRF", model: "STEEL MUSCLE S1L4", size: "10.00 R20",
  quantity: 8, priceList: 22500, discountPercent: 7, discountAmount: 1575,
  sellingPrice: 20925, gstPercent: 28, paymentMode: "Bank Transfer",
  totalValue: 214272, hsnCode: "4011",
  invoiceKind: "Tax Invoice", invoiceNumber: "SKT-0001",
};

const kachaSale = {
  id: "2", customerName: "Saheb Kumar", mobileNumber: "9999700164",
  customerAddress: "Moti Nagar, New Delhi",
  vehicleNumber: "DL8CAB1234", customerType: "Retail", date: Date.now(),
  categoryId: "car", tyreClass: "new",
  brand: "JK", model: "Tyre 185/70-14 t.l", size: "185/70 R14",
  quantity: 4, priceList: 4000, discountPercent: 0, discountAmount: 0,
  sellingPrice: 4000, gstPercent: 0, paymentMode: "UPI",
  totalValue: 16000, invoiceKind: "Kacha Bill", invoiceNumber: "CM-0064",
};

fs.writeFileSync('/app/tmp/gst.html', buildGstInvoiceHtml({ invoiceType:"Tax Invoice", invoiceNumber:"SKT-0001", sale:gstSale, shop }));
fs.writeFileSync('/app/tmp/kacha.html', buildKachaBillHtml({ invoiceType:"Kacha Bill", invoiceNumber:"CM-0064", sale:kachaSale, shop }));
console.log("OK. GST bytes:", fs.statSync('/app/tmp/gst.html').size, "Kacha bytes:", fs.statSync('/app/tmp/kacha.html').size);
