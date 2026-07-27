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
  size: string;
  tubeType: TubeType;
  construction: ConstructionType;
  plyRating: string;
  loadIndex: string;
  speedRating: string;
  purchasePrice: number;
  sellingPrice: number;
  currentStock: number;
  rackNumber: string;
  createdAt?: number;
  updatedAt?: number;
}

export const TUBE_OPTIONS: TubeType[] = ["Tubeless", "Tube"];
export const CONSTRUCTION_OPTIONS: ConstructionType[] = ["Radial", "Bias"];
export const TYRE_CLASSES: { value: TyreClass; label: string; hint: string; icon: string }[] = [
  { value: "new", label: "New Tyres", hint: "Full inventory management", icon: "tire" },
  { value: "old", label: "Old Tyres", hint: "Stock in / out / current", icon: "tire-flat" },
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

export type PaymentMode = "Cash" | "UPI" | "Card" | "Credit";
export const PAYMENT_MODES: PaymentMode[] = ["Cash", "UPI", "Card", "Credit"];

export interface Sale {
  id: string;
  customerName: string;
  mobileNumber: string;
  vehicleNumber: string;
  date: number;
  categoryId: VehicleCategoryId;
  brand: string;
  model: string;
  size: string;
  quantity: number;
  sellingPrice: number;
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
  totalSpent: number;
  saleCount: number;
  lastPurchaseAt: number;
  createdAt?: number;
}
