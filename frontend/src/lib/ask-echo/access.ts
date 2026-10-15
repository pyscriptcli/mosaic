import { ALL_APP_PAGES, resolveAccess, type AccessConfig as FeatureAccessConfig, type AppPage } from "@/lib/access-control";

export type EchoSourcePage = "meetings" | "tasks" | "notebook" | "forms" | "demands" | "market-insights" | "google-ads";
export type EchoPage = AppPage;

const SOURCE_PAGES: EchoSourcePage[] = ["meetings", "tasks", "notebook", "forms", "demands", "market-insights"];

interface AccessConfig extends FeatureAccessConfig { admins?: Array<{ email: string; active?: boolean }> }

export function resolveAllowedPages(email: string, config: AccessConfig): EchoPage[] {
  return resolveAccess(email, config).allowedPages.filter((page) => page !== "performance-marketing" && page !== "google-ads");
}

export function sourcesEnabledForPages(pages: EchoPage[]): EchoSourcePage[] {
  return SOURCE_PAGES.filter((page) => pages.includes(page));
}
