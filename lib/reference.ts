import type { ExistingStore, Language, PolicyProfile, Tier } from "./types";

export interface AllowedCity {
  city: string;
  state: string;
  pinPrefix: string;
  tier: Tier;
}

/** Section 4.5 — embedded reference data. */
export const ALLOWED_CITIES: AllowedCity[] = [
  { city: "Bengaluru", state: "Karnataka", pinPrefix: "560", tier: "Tier 1" },
  { city: "Mysuru", state: "Karnataka", pinPrefix: "570", tier: "Tier 2" },
  { city: "Mangaluru", state: "Karnataka", pinPrefix: "575", tier: "Tier 2" },
  { city: "Hubballi-Dharwad", state: "Karnataka", pinPrefix: "580", tier: "Tier 2" },
  { city: "Belagavi", state: "Karnataka", pinPrefix: "590", tier: "Tier 2" },
  { city: "Tumakuru", state: "Karnataka", pinPrefix: "572", tier: "Tier 3" },
  { city: "Davanagere", state: "Karnataka", pinPrefix: "577", tier: "Tier 3" },
];

export const CITY_BY_NAME = new Map(ALLOWED_CITIES.map((c) => [c.city, c]));
export const CITY_BY_PREFIX = new Map(ALLOWED_CITIES.map((c) => [c.pinPrefix, c]));

/** N-05 aliases, keyed by the normalised (lowercase, de-punctuated) form. */
export const CITY_ALIASES: Record<string, string> = {
  bangalore: "Bengaluru",
  bengaluru: "Bengaluru",
  blr: "Bengaluru",
  mysore: "Mysuru",
  mysuru: "Mysuru",
  mangalore: "Mangaluru",
  mangaluru: "Mangaluru",
  hubli: "Hubballi-Dharwad",
  hublidharwad: "Hubballi-Dharwad",
  hubballi: "Hubballi-Dharwad",
  hubballidharwad: "Hubballi-Dharwad",
  dharwad: "Hubballi-Dharwad",
  belgaum: "Belagavi",
  belagavi: "Belagavi",
  tumkur: "Tumakuru",
  tumakuru: "Tumakuru",
  davanagere: "Davanagere",
  davangere: "Davanagere",
};

export const LANGUAGES: Language[] = ["Kannada", "English", "Hindi"];

/** Section 4.6 — embedded so the app works when a judge's file omits the sheet. */
export const EMBEDDED_STORES: ExistingStore[] = [
  { storeId: "ST-01", city: "Bengaluru", pinCode: "560001", opened: "2019", source: "embedded" },
  { storeId: "ST-02", city: "Bengaluru", pinCode: "560034", opened: "2020", source: "embedded" },
  { storeId: "ST-03", city: "Bengaluru", pinCode: "560038", opened: "2021", source: "embedded" },
  { storeId: "ST-04", city: "Bengaluru", pinCode: "560066", opened: "2022", source: "embedded" },
  { storeId: "ST-05", city: "Bengaluru", pinCode: "560076", opened: "2023", source: "embedded" },
  { storeId: "ST-06", city: "Mysuru", pinCode: "570009", opened: "2021", source: "embedded" },
  { storeId: "ST-07", city: "Mysuru", pinCode: "570017", opened: "2024", source: "embedded" },
  { storeId: "ST-08", city: "Mangaluru", pinCode: "575001", opened: "2022", source: "embedded" },
  { storeId: "ST-09", city: "Hubballi-Dharwad", pinCode: "580020", opened: "2023", source: "embedded" },
  { storeId: "ST-10", city: "Belagavi", pinCode: "590001", opened: "2024", source: "embedded" },
];

/** Section 5.1 — shipped defaults, editable at runtime. */
export const BRAND_DEFAULT_POLICY: PolicyProfile = {
  name: "Brand default",
  brandName: "Kavi Retail",
  isDefault: true,
  version: 1,
  createdAt: "2026-10-26T00:00:00.000Z",
  tierMinInvestmentLakh: { "Tier 1": 30, "Tier 2": 20, "Tier 3": 15 },
  tierMinSpaceSqft: { "Tier 1": 400, "Tier 2": 350, "Tier 3": 300 },
  tierPreferredBand: {
    "Tier 1": { min: 400, max: 1200 },
    "Tier 2": { min: 350, max: 1000 },
    "Tier 3": { min: 300, max: 800 },
  },
  hardInvestmentFloorRatio: 0.75,
  acceptableFloors: ["Ground", "Mall unit"],
  scoreWeights: { investment: 30, experience: 20, space: 25, business: 15, launch: 10 },
  reservationWindowDays: 45,
  realisticMonthsSpaceSecured: 3.0,
  realisticMonthsNoSpace: 4.5,
  realisticMonthsZeroExperiencePenalty: 0.25,
  trainingWeeks: 2,
  trainingWeeksZeroExperienceBonus: 1,
  trainingStoreOverrides: { Tumakuru: "ST-01", Davanagere: "ST-09" },
  defaultLanguage: "English",
  statusLabels: {
    APPROVED: "Approved",
    WAITLISTED: "Waitlisted",
    "ON HOLD": "On hold",
    REDIRECTED: "Redirected",
    "NOT PROCEEDING": "Not proceeding",
  },
};

export const POLICY_PRESETS: PolicyProfile[] = [
  BRAND_DEFAULT_POLICY,
  {
    ...BRAND_DEFAULT_POLICY,
    name: "Aggressive Tier-3 expansion",
    isDefault: false,
    tierMinInvestmentLakh: { "Tier 1": 30, "Tier 2": 18, "Tier 3": 10 },
    tierMinSpaceSqft: { "Tier 1": 400, "Tier 2": 320, "Tier 3": 250 },
    tierPreferredBand: {
      "Tier 1": { min: 400, max: 1200 },
      "Tier 2": { min: 320, max: 1000 },
      "Tier 3": { min: 250, max: 800 },
    },
    acceptableFloors: ["Ground", "Mall unit", "Upper"],
    reservationWindowDays: 60,
  },
  {
    ...BRAND_DEFAULT_POLICY,
    name: "Conservative",
    isDefault: false,
    tierMinInvestmentLakh: { "Tier 1": 40, "Tier 2": 28, "Tier 3": 20 },
    tierMinSpaceSqft: { "Tier 1": 500, "Tier 2": 420, "Tier 3": 360 },
    tierPreferredBand: {
      "Tier 1": { min: 500, max: 1200 },
      "Tier 2": { min: 420, max: 1000 },
      "Tier 3": { min: 360, max: 800 },
    },
    hardInvestmentFloorRatio: 0.9,
    reservationWindowDays: 30,
  },
];

/** Command Centre recruitment-gap suggestions, by tier. */
export const SOURCING_CHANNELS: Record<Tier, string[]> = {
  "Tier 1": [
    "Retail broker network in the metro catchment",
    "Franchise expos and existing-partner referrals",
    "LinkedIn outreach to multi-store retail owners",
  ],
  "Tier 2": [
    "District retailers' association outreach",
    "Referrals from the nearest existing store's partner",
    "Regional-language classifieds and local trade press",
  ],
  "Tier 3": [
    "Local trade bodies and chamber of commerce lists",
    "Walk-in meets hosted at the nearest existing store",
    "Kannada-language radio and district newspaper adverts",
  ],
};

export const STATUS_COLORS: Record<string, { chip: string; dot: string; text: string; border: string }> = {
  APPROVED: {
    chip: "bg-emerald-50 text-emerald-800 border-emerald-200",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    border: "border-emerald-200",
  },
  WAITLISTED: {
    chip: "bg-amber-50 text-amber-900 border-amber-200",
    dot: "bg-amber-500",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  "ON HOLD": {
    chip: "bg-sky-50 text-sky-800 border-sky-200",
    dot: "bg-sky-500",
    text: "text-sky-700",
    border: "border-sky-200",
  },
  REDIRECTED: {
    chip: "bg-purple-50 text-purple-800 border-purple-200",
    dot: "bg-purple-500",
    text: "text-purple-700",
    border: "border-purple-200",
  },
  "NOT PROCEEDING": {
    chip: "bg-neutral-100 text-neutral-700 border-neutral-300",
    dot: "bg-neutral-400",
    text: "text-neutral-600",
    border: "border-neutral-300",
  },
};

export const TRAINING_TOPICS = [
  "Product knowledge and range",
  "POS and billing",
  "Inventory and replenishment",
  "Customer service standards",
  "Brand standards and visual merchandising",
  "Local marketing and community activation",
];
