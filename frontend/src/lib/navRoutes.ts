import type { NavView } from "@/components/Sidebar";

const ROUTE_BY_VIEW: Partial<Record<NavView, string>> = {
  dashboard: "/dashboard",
  project: "/projects",
  delta: "/contracts",
  tasks: "/tasks",
  notebook: "/notebook",
  reports: "/reports",
  "market-insights": "/market-insights",
  demands: "/demands",
  meetings: "/meetings",
  minutes: "/meetings/notetaker",
  maps: "/maps",
  bsc: "/bsc",
  "property-decks": "/property-decks",
  forms: "/forms",
  "business-analysis": "/it-projects",
  "performance-marketing": "/knowledge-center/performance-marketing",
  "google-ads": "/knowledge-center/performance-marketing/google-ads",
};

export function navRouteForView(view: NavView): string | null {
  return ROUTE_BY_VIEW[view] || null;
}

export function navViewForPath(pathname: string): NavView | null {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (path === "/" || path === "/dashboard" || path.startsWith("/dashboard/")) return "dashboard";
  if (path === "/projects" || path.startsWith("/projects/")) return "project";
  if (path === "/contracts" || path.startsWith("/contracts/") || path === "/delta" || path.startsWith("/delta/")) return "delta";
  if (path === "/tasks" || path.startsWith("/tasks/")) return "tasks";
  if (path === "/notebook" || path.startsWith("/notebook/")) return "notebook";
  if (path === "/reports" || path.startsWith("/reports/")) return "reports";
  if (path === "/market-insights" || path.startsWith("/market-insights/")) return "market-insights";
  if (path === "/demands" || path.startsWith("/demands/")) return "demands";
  if (path === "/meetings/notetaker" || path.startsWith("/meetings/notetaker/") || path === "/notetaker" || path.startsWith("/notetaker/") || path === "/minutes" || path.startsWith("/minutes/")) return "minutes";
  if (path === "/maps" || path.startsWith("/maps/")) return "maps";
  if (path === "/bsc" || path.startsWith("/bsc/")) return "bsc";
  if (path === "/property-decks" || path.startsWith("/property-decks/")) return "property-decks";
  if (path === "/meetings" || path.startsWith("/meetings/")) return "meetings";
  if (path === "/forms" || path.startsWith("/forms/")) return "forms";
  if (path === "/ba" || path.startsWith("/ba/") || path === "/business-analysis" || path.startsWith("/business-analysis/") || path === "/it-projects" || path.startsWith("/it-projects/")) return "business-analysis";
  if (path === "/knowledge-center/performance-marketing/google-ads" || path.startsWith("/knowledge-center/performance-marketing/google-ads/")) return "google-ads";
  if (path === "/knowledge-center/performance-marketing" || path.startsWith("/knowledge-center/performance-marketing/")) return "performance-marketing";
  if (path === "/knowledge-center" || path.startsWith("/knowledge-center/")) return "performance-marketing";

  return null;
}
