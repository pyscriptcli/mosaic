export type AppPage = "dashboard" | "project" | "tasks" | "notebook" | "reports" | "market-insights" | "demands" | "meetings" | "minutes" | "forms" | "delta" | "business-analysis" | "bsc";
export type FeatureId = "ask-echo" | "notetaker-record" | "notetaker-upload" | "meetings-export" | "forms-rfp-autofill" | "forms-pdf-preview" | "forms-submit";

export type FeatureAccessRule = { email: string; allowedFeatures?: string[]; allowedPages?: string[] };
export type AccessConfig = {
  defaultPageAccess?: string[];
  defaultFeatureAccess?: string[];
  pagePermissions?: FeatureAccessRule[];
  features?: { askEchoEnabled?: boolean };
  formFeatures?: { rfpAutofill?: boolean; pdfPreview?: boolean };
};

export const ALL_APP_PAGES: AppPage[] = ["dashboard", "project", "tasks", "notebook", "reports", "market-insights", "demands", "meetings", "minutes", "forms", "delta", "business-analysis", "bsc"];
export const ALL_FEATURES: FeatureId[] = ["ask-echo", "notetaker-record", "notetaker-upload", "meetings-export", "forms-rfp-autofill", "forms-pdf-preview", "forms-submit"];
export const FEATURE_CATALOG: Record<FeatureId, { label: string; requiredPage?: AppPage; global?: "askEchoEnabled" | "rfpAutofill" | "pdfPreview" }> = {
  "ask-echo": { label: "Ask Echo", global: "askEchoEnabled" },
  "notetaker-record": { label: "Record meetings", requiredPage: "minutes" },
  "notetaker-upload": { label: "Upload meeting material", requiredPage: "minutes" },
  "meetings-export": { label: "Export meeting minutes", requiredPage: "meetings" },
  "forms-rfp-autofill": { label: "RFP Autofill", requiredPage: "forms", global: "rfpAutofill" },
  "forms-pdf-preview": { label: "PDF Preview", requiredPage: "forms", global: "pdfPreview" },
  "forms-submit": { label: "Submit forms", requiredPage: "forms" },
};

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
const validPages = (values: unknown, fallback: AppPage[]): AppPage[] => {
  const list = Array.isArray(values) ? values.filter((value): value is AppPage => ALL_APP_PAGES.includes(value as AppPage)) : [];
  return Array.from(new Set(list.length ? list : fallback));
};
export function normalizeFeatures(values: unknown, fallback: FeatureId[] = ALL_FEATURES): FeatureId[] {
  if (values === undefined || values === null) return Array.from(new Set(fallback));
  if (!Array.isArray(values)) return [];
  const list = values.filter((value): value is FeatureId => ALL_FEATURES.includes(value as FeatureId));
  return Array.from(new Set(list));
}
export function globalFeatureAvailable(feature: FeatureId, config: AccessConfig): boolean {
  const mapping = FEATURE_CATALOG[feature].global;
  if (mapping === "askEchoEnabled") return config.features?.askEchoEnabled !== false;
  if (mapping === "rfpAutofill") return config.formFeatures?.rfpAutofill !== false;
  if (mapping === "pdfPreview") return config.formFeatures?.pdfPreview !== false;
  return true;
}
export function resolveAccess(email: string, config: AccessConfig): { allowedPages: AppPage[]; allowedFeatures: FeatureId[] } {
  const defaultPages = validPages(config.defaultPageAccess, ["forms"]);
  const defaultFeatures = normalizeFeatures(config.defaultFeatureAccess, ALL_FEATURES);
  const rule = config.pagePermissions?.find((entry) => normalize(entry.email) === normalize(email));
  const allowedPages = validPages(rule?.allowedPages, defaultPages);
  const selectedFeatures = normalizeFeatures(rule?.allowedFeatures, defaultFeatures);
  const allowedFeatures = selectedFeatures.filter((feature) => {
    const metadata = FEATURE_CATALOG[feature];
    return globalFeatureAvailable(feature, config) && (!metadata.requiredPage || allowedPages.includes(metadata.requiredPage));
  });
  return { allowedPages, allowedFeatures };
}
export function canUseFeature(feature: string, access: { allowedFeatures: FeatureId[] }): feature is FeatureId {
  return ALL_FEATURES.includes(feature as FeatureId) && access.allowedFeatures.includes(feature as FeatureId);
}
