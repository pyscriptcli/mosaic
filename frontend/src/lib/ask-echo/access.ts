import { ALL_APP_PAGES, resolveAccess, type AccessConfig as FeatureAccessConfig, type AppPage } from "@/lib/access-control";

export type EchoSourcePage = "meetings" | "tasks" | "notebook" | "forms";
export type EchoPage = AppPage;

const SOURCE_PAGES: EchoSourcePage[] = ["meetings", "tasks", "notebook", "forms"];

interface AccessConfig extends FeatureAccessConfig { admins?: Array<{ email: string; active?: boolean }> }

export function resolveAllowedPages(email: string, config: AccessConfig): EchoPage[] {
  return resolveAccess(email, config).allowedPages;
}

export function sourcesEnabledForPages(pages: EchoPage[]): EchoSourcePage[] {
  return SOURCE_PAGES.filter((page) => pages.includes(page));
}
