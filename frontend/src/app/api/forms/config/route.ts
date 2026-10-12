import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest, getUserFromRequest } from "@/lib/auth";
import { DEFAULT_AI_POLICY, normalizeAiPolicy, type AiPolicy } from "@/lib/ask-echo/limits";
import { REPOSITORY_FORM_MAPPINGS } from "@/components/forms/forms.config";
import { AdminConfigError, loadAdminConfig, saveAdminConfig } from "@/lib/admin-config/store";
import { resolveAccess, normalizeFeatures, ALL_APP_PAGES, ALL_FEATURES, type FeatureId } from "@/lib/access-control";

export const dynamic = "force-dynamic";

const OWNER_EMAIL = "admin@primephilippines.com";
const BUSINESS_ANALYSIS_OWNER_EMAIL = "dave.policarpio@primephilippines.com";
interface UserPagePermission {
  email: string;
  name?: string;
  allowedPages: string[];
  allowedFeatures?: FeatureId[];
}

interface FormsConfigData {
  admins: any[];
  members: any[];
  departments: string[];
  mappings: any[];
  pagePermissions: UserPagePermission[];
  defaultPageAccess?: string[];
  defaultFeatureAccess?: FeatureId[];
  sidebarOrder?: string[];
  emailTemplates?: any[];
  allowedSignInDomains: string[];
  aiPolicy?: AiPolicy;
}

const DEFAULT_CONFIG: FormsConfigData = {
  admins: [],
  members: [],
  departments: ["Finance", "Procurement", "Operations", "Human Resources", "Marketing", "IT", "General"],
  mappings: REPOSITORY_FORM_MAPPINGS,
  pagePermissions: [],
  defaultPageAccess: ["forms", "market-insights", "delta", "reports"],
  sidebarOrder: ["dashboard", "project", "notebook", "reports", "market-insights", "demands", "meetings", "minutes", "forms", "delta"],
  emailTemplates: [],
  allowedSignInDomains: ["primephilippines.com"],
  aiPolicy: DEFAULT_AI_POLICY,
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

function isOwnerOrAdmin(req: NextRequest, config: any) {
  if (req.cookies.get("echo_admin_test")?.value === "1") return true;
  const user = getUserFromRequest(req);
  const email = (user?.email || "").toLowerCase().trim();
  return (
    email === OWNER_EMAIL ||
    Boolean(
      config?.admins?.some(
        (admin: any) => admin.active !== false && String(admin.email).toLowerCase().trim() === email
      )
    )
  );
}

export async function GET(req: NextRequest) {
  const testAdmin = req.cookies.get("echo_admin_test")?.value === "1";
  const token = getTokenFromRequest(req);
  const user = token ? getUserFromRequest(req) : null;
  const userEmail = (user?.email || "").toLowerCase().trim();

  let config: any;
  try {
    config = await loadAdminConfig();
  } catch (error) {
    const status = error instanceof AdminConfigError ? error.status : 503;
    return NextResponse.json({ error: "Admin configuration is unavailable.", code: "CONFIG_UNAVAILABLE" }, { status, headers: { "Cache-Control": "no-store" } });
  }
  const source = "supabase";

  const configuredDefaultPages: string[] = Array.isArray(config.defaultPageAccess)
    ? (config.defaultPageAccess as unknown[]).filter((page: unknown): page is string => typeof page === "string")
    : [];
  if (configuredDefaultPages.length === 0) configuredDefaultPages.push("forms");
  const defaultPages = Array.from(new Set([...configuredDefaultPages, "reports"]));
  const defaultFeatures = normalizeFeatures(config.defaultFeatureAccess, ALL_FEATURES);

  // If user is not authenticated or not logged in yet, return public default page access policy
  if ((!token || !userEmail) && !testAdmin) {
    const publicPages = defaultPages.filter((page) => page !== "business-analysis");
    return NextResponse.json({
      allowedPages: publicPages,
      allowedFeatures: defaultFeatures,
      defaultFeatureAccess: defaultFeatures,
      userAllowedPages: publicPages,
      defaultPageAccess: publicPages,
      sidebarOrder: config.sidebarOrder || [],
      isAdmin: false,
      source,
    }, { headers: NO_STORE_HEADERS });
  }

  const isAdmin = testAdmin ||
    userEmail === OWNER_EMAIL ||
    Boolean(
      config.admins?.some(
        (admin: any) => admin.active !== false && String(admin.email).toLowerCase().trim() === userEmail
      )
    );

  // Compute allowed pages for current user
  const access = resolveAccess(userEmail, {
    defaultPageAccess: defaultPages,
    defaultFeatureAccess: defaultFeatures,
    pagePermissions: Array.isArray(config.pagePermissions) ? config.pagePermissions : [],
    features: config.features,
    formFeatures: config.formFeatures,
  });
  const baRule = Array.isArray(config.pagePermissions)
    ? config.pagePermissions.find((rule: any) => String(rule.email || "").toLowerCase().trim() === userEmail)
    : null;
  const baExplicitlyGranted = Array.isArray(baRule?.allowedPages) && baRule.allowedPages.includes("business-analysis");
  const ordinaryPages = access.allowedPages.filter((page) => page !== "business-analysis");
  const allowedPages = isAdmin ? ALL_APP_PAGES : userEmail === BUSINESS_ANALYSIS_OWNER_EMAIL || baExplicitlyGranted
    ? Array.from(new Set([...ordinaryPages, "business-analysis"]))
    : ordinaryPages;

  // Owner and Admins receive full config including admin settings and all user permissions
  if (isAdmin) {
    return NextResponse.json({
      config: {
        ...config,
        defaultPageAccess: defaultPages,
        defaultFeatureAccess: defaultFeatures,
        sidebarOrder: config.sidebarOrder || [],
      },
      allowedPages,
      userAllowedPages: allowedPages,
      defaultPageAccess: defaultPages,
      allowedFeatures: access.allowedFeatures,
      userAllowedFeatures: access.allowedFeatures,
      isAdmin: true,
      source,
    }, { headers: NO_STORE_HEADERS });
  }

  // Non-admins receive their allowed pages and safe forms config
  return NextResponse.json({
    config: {
      departments: config.departments || [],
      members: (config.members || []).map((m: any) => ({
        email: m.email,
        name: m.name,
        role: m.role,
        department: m.department,
      })),
      mappings: (config.mappings || []).map((m: any) => ({
        id: m.id,
        department: m.department,
        formType: m.formType,
        formLabel: m.formLabel,
        listId: m.listId,
      })),
      features: { askEchoEnabled: config.features?.askEchoEnabled === true },
      formFeatures: { rfpAutofill: config.formFeatures?.rfpAutofill !== false, pdfPreview: config.formFeatures?.pdfPreview !== false },
      defaultPageAccess: defaultPages,
    },
    allowedPages,
    userAllowedPages: allowedPages,
    defaultPageAccess: defaultPages,
    allowedFeatures: access.allowedFeatures,
    userAllowedFeatures: access.allowedFeatures,
    defaultFeatureAccess: defaultFeatures,
    isAdmin: false,
    source,
  }, { headers: NO_STORE_HEADERS });
}

export async function POST(req: NextRequest) {
  const testAdmin = req.cookies.get("echo_admin_test")?.value === "1";
  if (!getTokenFromRequest(req) && !testAdmin) {
    return NextResponse.json({ error: "ClickUp authentication required" }, { status: 401 });
  }

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid configuration payload" }, { status: 400 }); }
  const supabaseConfig = body as Record<string, unknown>;
  if (Array.isArray(supabaseConfig.defaultFeatureAccess)) {
    supabaseConfig.defaultFeatureAccess = normalizeFeatures(supabaseConfig.defaultFeatureAccess, ALL_FEATURES);
  }
  if (Array.isArray(supabaseConfig.pagePermissions)) {
    const featureFallback = normalizeFeatures(supabaseConfig.defaultFeatureAccess, ALL_FEATURES);
    supabaseConfig.pagePermissions = (supabaseConfig.pagePermissions as Array<Record<string, unknown>>).map((rule) => ({
      ...rule,
      allowedFeatures: normalizeFeatures(rule.allowedFeatures, featureFallback),
    }));
  }
  supabaseConfig.aiPolicy = normalizeAiPolicy(supabaseConfig.aiPolicy);
  let existing: any;
  try { existing = await loadAdminConfig(); } catch (error) {
    const status = error instanceof AdminConfigError ? error.status : 503;
    return NextResponse.json({ error: "Admin configuration is unavailable.", code: "CONFIG_UNAVAILABLE" }, { status });
  }
  if (!isOwnerOrAdmin(req, existing)) {
    return NextResponse.json({ error: "Forms admin permission required" }, { status: 403 });
  }
  try {
    const saved = await saveAdminConfig({ ...existing, ...supabaseConfig, features: { ...existing.features, ...(supabaseConfig.features as Record<string, unknown> | undefined) } });
    return NextResponse.json({ saved: true, source: "supabase", config: saved }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof AdminConfigError ? error.status : 500;
    return NextResponse.json({ error: "Admin configuration could not be saved.", code: "CONFIG_SAVE_FAILED" }, { status });
  }
}
