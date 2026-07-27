// Indian official languages catalogue for the in-app language switcher.
// Note: strings themselves are English (business-friendly baseline). Users can
// still pick a native label — this is the standard KhataBook / Vyapar pattern.

export interface AppLanguage {
  code: string;
  english: string;
  native: string;
}

export const INDIAN_LANGUAGES: AppLanguage[] = [
  { code: "en", english: "English", native: "English" },
  { code: "hi", english: "Hindi", native: "हिन्दी" },
  { code: "bn", english: "Bengali", native: "বাংলা" },
  { code: "mr", english: "Marathi", native: "मराठी" },
  { code: "te", english: "Telugu", native: "తెలుగు" },
  { code: "ta", english: "Tamil", native: "தமிழ்" },
  { code: "gu", english: "Gujarati", native: "ગુજરાતી" },
  { code: "kn", english: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml", english: "Malayalam", native: "മലയാളം" },
  { code: "pa", english: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "or", english: "Odia", native: "ଓଡ଼ିଆ" },
  { code: "as", english: "Assamese", native: "অসমীয়া" },
  { code: "ur", english: "Urdu", native: "اردو" },
  { code: "sa", english: "Sanskrit", native: "संस्कृतम्" },
  { code: "ks", english: "Kashmiri", native: "کٲشُر" },
  { code: "sd", english: "Sindhi", native: "سنڌي" },
  { code: "kok", english: "Konkani", native: "कोंकणी" },
  { code: "mai", english: "Maithili", native: "मैथिली" },
  { code: "mni", english: "Manipuri", native: "মৈতৈলোন্" },
  { code: "ne", english: "Nepali", native: "नेपाली" },
  { code: "brx", english: "Bodo", native: "बड़ो" },
  { code: "sat", english: "Santali", native: "ᱥᱟᱱᱛᱟᱲᱤ" },
  { code: "doi", english: "Dogri", native: "डोगरी" },
];
