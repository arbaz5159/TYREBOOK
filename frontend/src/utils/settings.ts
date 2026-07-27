// Central reader for owner-configurable settings persisted from the Admin
// Panel. Each screen (Sales / Dashboard / Inventory / etc.) should consume
// these helpers instead of duplicating storage keys.

import { DEFAULT_DISCOUNT_BY_TYPE, type CustomerType } from "@/src/constants/inventory";
import { storage } from "@/src/utils/storage";

/* -------------------- Pricing config -------------------- */

export interface PricingConfig {
  defaultGstPercent: number;
  minMarginPercent: number;
  discountByType: Record<CustomerType, number>;
}

const PRICING_KEY = "tyrebook.pricingConfig";

const DEFAULT_PRICING: PricingConfig = {
  defaultGstPercent: 18,
  minMarginPercent: 5,
  discountByType: { ...DEFAULT_DISCOUNT_BY_TYPE },
};

export async function getPricingConfig(): Promise<PricingConfig> {
  const raw = await storage.getItem<string | null>(PRICING_KEY, null);
  if (!raw) return DEFAULT_PRICING;
  try {
    const parsed = JSON.parse(raw);
    return {
      defaultGstPercent: Number(parsed.defaultGstPercent) || 18,
      minMarginPercent: Number(parsed.minMarginPercent) || 5,
      discountByType: {
        Retail: Number(parsed?.discountByType?.Retail) || 0,
        Wholesale: Number(parsed?.discountByType?.Wholesale) || 0,
        Dealer: Number(parsed?.discountByType?.Dealer) || 0,
        Fleet: Number(parsed?.discountByType?.Fleet) || 0,
        Government: Number(parsed?.discountByType?.Government) || 0,
      },
    };
  } catch {
    return DEFAULT_PRICING;
  }
}

/* -------------------- App settings -------------------- */

export type AppLanguageCode = "en" | "hi" | "kn" | "mr";

export interface AppSettings {
  language: AppLanguageCode;
  currencySymbol: string;
  lowStockThreshold: number;
  enableWhatsappShare: boolean;
  enablePdfInvoice: boolean;
  enableLowStockAlerts: boolean;
  enableStaffProfitView: boolean;
}

const APP_KEY = "tyrebook.appSettings";
export const LANGUAGE_KEY = "tyrebook.language"; // legacy key used by /language

export const DEFAULT_APP_SETTINGS: AppSettings = {
  language: "en",
  currencySymbol: "₹",
  lowStockThreshold: 3,
  enableWhatsappShare: true,
  enablePdfInvoice: true,
  enableLowStockAlerts: true,
  enableStaffProfitView: false,
};

export async function getAppSettings(): Promise<AppSettings> {
  const raw = await storage.getItem<string | null>(APP_KEY, null);
  if (!raw) return DEFAULT_APP_SETTINGS;
  try {
    return { ...DEFAULT_APP_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export async function saveAppSettings(next: AppSettings): Promise<void> {
  await storage.setItem(APP_KEY, JSON.stringify(next));
  // Keep the legacy /language screen in sync — both directions.
  await storage.setItem(LANGUAGE_KEY, next.language);
}

// Called by /language when user picks from the language switcher. Writes to
// both the legacy key and the shared app settings so admin views stay in sync.
export async function setLanguage(code: AppLanguageCode): Promise<void> {
  await storage.setItem(LANGUAGE_KEY, code);
  const current = await getAppSettings();
  if (current.language !== code) {
    await storage.setItem(
      APP_KEY,
      JSON.stringify({ ...current, language: code }),
    );
  }
}
