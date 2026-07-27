// Vehicle category catalogue for the Inventory & Purchase modules.

export type VehicleCategoryId =
  | "bike"
  | "car"
  | "auto"
  | "tractor"
  | "truck"
  | "bus"
  | "otr";

export interface VehicleCategory {
  id: VehicleCategoryId;
  name: string;
  icon: string; // MaterialCommunityIcons name
  hint: string;
}

export const VEHICLE_CATEGORIES: VehicleCategory[] = [
  { id: "bike", name: "Bike & Scooty", icon: "motorbike", hint: "2 wheelers" },
  { id: "car", name: "Car", icon: "car", hint: "Passenger cars & SUVs" },
  { id: "auto", name: "Auto Rickshaw", icon: "rickshaw", hint: "3 wheelers" },
  { id: "tractor", name: "Tractor", icon: "tractor", hint: "Agriculture" },
  { id: "truck", name: "Truck", icon: "truck", hint: "Commercial cargo" },
  { id: "bus", name: "Bus", icon: "bus", hint: "Passenger coaches" },
  { id: "otr", name: "OTR / Earthmover", icon: "excavator", hint: "Off the road" },
];

export const CATEGORY_MAP: Record<VehicleCategoryId, VehicleCategory> =
  VEHICLE_CATEGORIES.reduce((acc, c) => {
    acc[c.id] = c;
    return acc;
  }, {} as Record<VehicleCategoryId, VehicleCategory>);

export type TubeType = "Tube" | "Tubeless";
export type ConstructionType = "Radial" | "Bias";
export type TyreClass = "new" | "old" | "remould";

export interface Tyre {
  id: string;
  categoryId: VehicleCategoryId;
  tyreClass: TyreClass; // "new" (default) | "old" | "remould"
  brand: string;
  model: string;
  pattern: string;
  size: string;
  tubeType: TubeType;
  construction: ConstructionType;
  plyRating: string;
  loadIndex: string;
  speedRating: string;
  vehicleCompatibility: string; // comma-separated: "Honda Activa 6G, Suzuki Access 125"
  purchasePrice: number;
  sellingPrice: number; // retail (default final price when no discount)
  wholesalePrice?: number; // legacy — replaced by companyPriceList
  mrp: number; // Max Retail Price printed on the tyre
  companyPriceList: number; // Company / dealer list price used as billing basis
  minStockAlert: number;
  currentStock: number;
  rackNumber: string;
  barcode?: string;
  createdAt?: number;
  updatedAt?: number;
}

// Vehicle master — used by the global search "Honda Activa 6G → front/rear size"
export interface VehicleModel {
  id: string;
  name: string; // "Honda Activa 6G"
  category: VehicleCategoryId;
  frontSize: string;
  rearSize: string;
  make?: string; // "Honda"
  createdAt?: number;
}

export const TUBE_OPTIONS: TubeType[] = ["Tubeless", "Tube"];
export const CONSTRUCTION_OPTIONS: ConstructionType[] = ["Radial", "Bias"];
export const TYRE_CLASSES: { value: TyreClass; label: string; hint: string; icon: string }[] = [
  { value: "new", label: "New Tyres", hint: "Full inventory management", icon: "tire" },
  { value: "old", label: "Old Tyres", hint: "Stock in / out / current", icon: "tire" },
  { value: "remould", label: "Remould Tyres", hint: "Stock in / out / current", icon: "recycle-variant" },
];

export interface Purchase {
  id: string;
  supplierName: string;
  invoiceNumber: string;
  date: number; // epoch millis
  categoryId: VehicleCategoryId;
  brand: string;
  model: string;
  size: string;
  quantity: number;
  purchasePrice: number;
  gstPercent: number;
  remarks: string;
  linkedTyreId?: string;
  totalValue: number;
  createdAt?: number;
}

export type PaymentMode = "Cash" | "UPI" | "Card" | "Bank Transfer" | "Credit";
export const PAYMENT_MODES: PaymentMode[] = ["Cash", "UPI", "Card", "Bank Transfer", "Credit"];

export type CustomerType = "Retail" | "Wholesale" | "Dealer" | "Fleet" | "Government";
export const CUSTOMER_TYPES: CustomerType[] = ["Retail", "Wholesale", "Dealer", "Fleet", "Government"];

// Default discount percentages by customer type — used when a customer has no
// personal override. Owner can still change per-bill.
export const DEFAULT_DISCOUNT_BY_TYPE: Record<CustomerType, number> = {
  Retail: 0,
  Wholesale: 15,
  Dealer: 25,
  Fleet: 20,
  Government: 10,
};

export interface Sale {
  id: string;
  customerName: string;
  mobileNumber: string;
  vehicleNumber: string;
  customerType: CustomerType;
  date: number;
  categoryId: VehicleCategoryId;
  tyreClass: TyreClass;
  brand: string;
  model: string;
  size: string;
  quantity: number;
  priceList: number; // Company Price List used as basis
  discountPercent: number;
  discountAmount: number; // absolute ₹ discount applied per unit
  sellingPrice: number; // final selling price per unit = priceList - discountAmount
  gstPercent: number;
  paymentMode: PaymentMode;
  linkedTyreId?: string;
  totalValue: number;
  createdAt?: number;
}

export interface Customer {
  id: string; // mobileNumber acts as stable id
  name: string;
  mobileNumber: string;
  vehicleNumbers: string[];
  customerType: CustomerType;
  defaultDiscount: number; // % override for this specific customer
  totalSpent: number;
  totalDiscountGiven: number;
  saleCount: number;
  lastPurchaseAt: number;
  createdAt?: number;
}
