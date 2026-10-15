"use client";

import React from "react";
import { createPortal } from "react-dom";
import { MosaicBrand } from "@/components/MosaicBrand";
import {
  LayoutGrid,
  Folder,
  FileText,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  LogOut,
  Settings,
  NotebookTabs,
  ClipboardCheck,
  ChartNoAxesColumnIncreasing,
  BriefcaseBusiness,
  Gauge,
  Globe,
  Wrench,
  Map as MapIcon,
  FileSpreadsheet,
  BookOpenText,
  Megaphone,
} from "lucide-react";

export type NavView = "dashboard" | "project" | "tasks" | "notebook" | "reports" | "market-insights" | "demands" | "meetings" | "minutes" | "maps" | "bsc" | "forms" | "delta" | "business-analysis" | "forms-admin" | "performance-marketing" | "google-ads";

interface SidebarProps {
  currentView: NavView;
  onSelectView: (view: NavView) => void;
  onPreloadView?: (view: NavView) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  user?: {
    id?: number | string;
    username?: string;
    email?: string;
    color?: string;
    profilePicture?: string | null;
    initials?: string;
    workspaceName?: string;
  } | null;
  onSignOut?: () => void;
  allowedPages?: NavView[];
  sidebarOrder?: NavView[];
  isAdmin?: boolean;
}

export function Sidebar({
  currentView,
  onSelectView,
  onPreloadView,
  isCollapsed: externalCollapsed,
  onToggleCollapse,
  user,
  onSignOut,
  allowedPages,
  sidebarOrder,
  isAdmin
}: SidebarProps) {
  const [isHovered, setIsHovered] = React.useState(false);
  const [expandedSections, setExpandedSections] = React.useState({
    personal: true,
    workspaces: true,
    monitoring: true,
    tools: true,
    knowledgeCenter: true,
    performanceMarketing: true,
  });
  const [isProfileMenuOpen, setIsProfileMenuOpen] = React.useState(false);
  const profileButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const profileMenuRef = React.useRef<HTMLDivElement | null>(null);
  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    if (!isProfileMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!profileMenuRef.current?.contains(target) && !profileButtonRef.current?.contains(target)) {
        setIsProfileMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsProfileMenuOpen(false);
        profileButtonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isProfileMenuOpen]);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 150);
  };

  // The parent owns the persistent state. Hover is only a temporary preview
  // when collapsed, so touch and keyboard users can still pin the drawer open.
  const effectiveCollapsed = externalCollapsed && !isHovered;

  const isOwner = user?.email?.toLowerCase() === "admin@primephilippines.com";
  const isProjectAdmin = isOwner || Boolean(isAdmin);

  const allNavItems = [
    {
      id: "dashboard" as NavView,
      label: "Dashboard",
      icon: LayoutGrid,
      badge: null
    },
    { id: "business-analysis" as NavView, label: "IT Projects", icon: BriefcaseBusiness, badge: null },
    {
      id: "project" as NavView,
      label: "Projects",
      icon: Folder,
      badge: null
    },
    {
      id: "delta" as NavView,
      label: "Contracts",
      icon: FileText,
      badge: null
    },
    { id: "demands" as NavView, label: "Demands", icon: ClipboardCheck, badge: null },
    { id: "reports" as NavView, label: "Reports", icon: ChartNoAxesColumnIncreasing, badge: null },
    {
      id: "market-insights" as NavView,
      label: "Market Insights",
      icon: Globe,
      badge: null
    },
    {
      id: "meetings" as NavView,
      label: "Meetings",
      icon: CalendarDays,
      badge: null
    },
    { id: "maps" as NavView, label: "Maps", icon: MapIcon, badge: null },
    { id: "bsc" as NavView, label: "BSC", icon: FileSpreadsheet, badge: null },
    {
      id: "notebook" as NavView,
      label: "Notebook",
      icon: NotebookTabs,
      badge: null
    },
    { id: "performance-marketing" as NavView, label: "Performance Marketing", icon: Megaphone, badge: null },
    { id: "google-ads" as NavView, label: "Google Ads", icon: BookOpenText, badge: null },
  ];

  const normalizedSidebarOrder = [...(sidebarOrder || [])];
  if (!normalizedSidebarOrder.includes("project")) {
    const notebookIndex = normalizedSidebarOrder.indexOf("notebook");
    if (notebookIndex >= 0) normalizedSidebarOrder.splice(notebookIndex, 0, "project");
  }
  const orderIndex = new Map(normalizedSidebarOrder.map((id, index) => [id, index]));
  const navItems = allNavItems.slice().sort((a, b) => {
    const fallback = allNavItems.length;
    return (orderIndex.get(a.id) ?? fallback) - (orderIndex.get(b.id) ?? fallback);
  }).filter((item) => Boolean(
    item.id === "maps" ||
    item.id === "bsc" ||
    allowedPages?.includes(item.id) ||
    (item.id === "notebook" && allowedPages?.includes("tasks")) ||
    (item.id === "project" && allowedPages?.includes("tasks")) ||
    (item.id === "delta" && (allowedPages?.includes("project") || allowedPages?.includes("tasks")))
  ));

  const navById = new Map(navItems.map((item) => [item.id, item]));
  const sidebarGroups = [
    { id: "personal" as const, label: "Personal Workspace", icon: BriefcaseBusiness, itemIds: ["business-analysis"] as NavView[] },
    { id: "workspaces" as const, label: "Workspaces", icon: LayoutGrid, itemIds: ["dashboard", "project", "delta", "notebook"] as NavView[] },
    { id: "monitoring" as const, label: "Monitoring", icon: Gauge, itemIds: ["demands", "reports"] as NavView[] },
    { id: "knowledgeCenter" as const, label: "Knowledge Center", icon: BookOpenText, itemIds: ["market-insights", "performance-marketing", "google-ads"] as NavView[] },
  ].map((group) => ({
    ...group,
    items: group.itemIds
      .map((id) => navById.get(id))
      .filter((item): item is (typeof navItems)[number] => Boolean(item))
      .sort((a, b) => (orderIndex.get(a.id) ?? allNavItems.length) - (orderIndex.get(b.id) ?? allNavItems.length)),
  })).filter((group) => group.items.length > 0);
  const meetingsItem = navById.get("meetings");
  const mapsItem = navById.get("maps");
  const bscItem = navById.get("bsc");
  const hasToolsItems = Boolean(meetingsItem || mapsItem || bscItem);
  const toolsItems = [meetingsItem, mapsItem, bscItem]
    .filter((item): item is (typeof navItems)[number] => Boolean(item))
    .sort((a, b) => (orderIndex.get(a.id) ?? allNavItems.length) - (orderIndex.get(b.id) ?? allNavItems.length));
  const collapsedGroups = [
    ...sidebarGroups,
    ...(toolsItems.length > 0 ? [{ id: "tools" as const, label: "Tools", icon: Wrench, items: toolsItems }] : []),
  ];

  const renderNavItem = (item: (typeof navItems)[number], nested = false, besideDisclosure = false) => {
    const Icon = item.icon;
    const isActive = currentView === item.id
      || (item.id === "notebook" && currentView === "tasks")
      || (item.id === "meetings" && currentView === "minutes");
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onSelectView(item.id)}
        onPointerEnter={() => onPreloadView?.(item.id)}
        onFocus={() => onPreloadView?.(item.id)}
        title={effectiveCollapsed ? item.label : undefined}
        aria-current={isActive ? "page" : undefined}
        aria-label={effectiveCollapsed ? item.label : undefined}
        className={`${besideDisclosure ? "min-w-0 flex-1" : "w-full"} min-h-10 flex items-center gap-2 ${nested ? "pl-3" : "px-2.5"} py-1.5 text-xs font-normal transition-colors cursor-pointer ${
          isActive
            ? "bg-[#FFFCFB] text-[#003366] border-l-4 border-[#C9A84C]"
            : "text-[#FFFCFB] hover:bg-[#174778] border-l-4 border-transparent"
        } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#FFBF00] ${effectiveCollapsed ? "justify-center !ml-0 !w-full !px-0 !border-l-0" : ""}`}
      >
        <Icon size={18} className={`shrink-0 ${isActive ? "text-[#C9A84C]" : "text-[#D7E3EF]"}`} />
        {!effectiveCollapsed && <span className="truncate">{item.label}</span>}
      </button>
    );
  };

  const renderDisclosureItem = (
    item: (typeof navItems)[number],
    section: "performanceMarketing",
    children: (typeof navItems)[number][],
  ) => (
    <div key={item.id}>
      <div className="flex items-center gap-1">
        {renderNavItem(item, false, true)}
        <button
          type="button"
          aria-expanded={expandedSections[section]}
          aria-label={`${expandedSections[section] ? "Collapse" : "Expand"} ${item.label}`}
          onClick={() => setExpandedSections((sections) => ({ ...sections, [section]: !sections[section] }))}
          className="shrink-0 p-2 text-[#9FB8CE] hover:text-[#FFFCFB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFBF00]"
        >
          {expandedSections[section] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
      </div>
      {expandedSections[section] && children.length > 0 && (
        <div className="ml-3 border-l border-[#31577D]">
          {children.map((child) => renderNavItem(child, true))}
        </div>
      )}
    </div>
  );

  const renderDisclosureGroup = (
    label: string,
    section: "performanceMarketing",
    children: (typeof navItems)[number][],
  ) => (
    <div key={`group-${section}`}>
      <button
        type="button"
        aria-expanded={expandedSections[section]}
        onClick={() => setExpandedSections((sections) => ({ ...sections, [section]: !sections[section] }))}
        className="flex min-h-9 w-full items-center justify-between px-2.5 py-1.5 text-xs text-[#E5EDF4] hover:bg-[#174778] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFBF00]"
      >
        <span>{label}</span>
        {expandedSections[section] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      {expandedSections[section] && (
        <div className="ml-3 border-l border-[#31577D]">
          {children.map((child) => renderNavItem(child, true))}
        </div>
      )}
    </div>
  );

  const isGroupActive = (group: (typeof collapsedGroups)[number]) => (
    (group.id === "tools" && currentView === "forms-admin")
    || group.items.some((item) => (
      currentView === item.id
      || (item.id === "notebook" && currentView === "tasks")
      || (item.id === "meetings" && currentView === "minutes")
    ))
  );

  return (
    <div
      className={`relative h-full z-40 shrink-0 transition-all duration-300 ease-in-out ${
        externalCollapsed ? "w-16 min-w-[64px]" : "w-[min(220px,calc(100vw-64px))] min-w-[64px]"
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <aside 
        className={`absolute top-0 left-0 h-full flex flex-col justify-between bg-[#003366] text-[#FFFCFB] border-r border-[#31577D] shadow-[4px_0_24px_rgba(0,51,102,0.18)] transition-all duration-300 ease-in-out z-40 select-none overflow-hidden ${
          effectiveCollapsed ? "w-16 min-w-[64px]" : "w-[min(220px,calc(100vw-64px))] min-w-[64px]"
        }`}
      >
        {/* Mosaic identity stays visible when the navigation is collapsed. */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className={`h-14 shrink-0 flex items-center border-b border-[#31577D] ${effectiveCollapsed ? "justify-between gap-1 px-2" : "justify-between px-3.5"}`}>
            <MosaicBrand compact={effectiveCollapsed} size={effectiveCollapsed ? "small" : "medium"} className="text-[#FFFCFB]" />

            {!effectiveCollapsed && (
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label={externalCollapsed ? "Pin sidebar expanded" : "Collapse sidebar"}
                aria-expanded={!externalCollapsed}
                title={externalCollapsed ? "Pin sidebar expanded" : "Collapse sidebar"}
                className="p-1.5 rounded-none hover:bg-[#174778] text-[#D7E3EF] hover:text-[#FFBF00] transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFBF00]"
              >
                <ChevronLeft size={16} />
              </button>
            )}
          </div>

          <nav aria-label="Primary navigation" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-2">
            {effectiveCollapsed ? (
              <div className="flex flex-col gap-1 py-1">
                {collapsedGroups.map((group) => {
                  const Icon = group.icon;
                  const groupActive = isGroupActive(group);
                  return (
                    <button
                      key={group.id}
                      type="button"
                      aria-label={`${group.label} navigation`}
                      title={group.label}
                      onClick={() => {
                        if (externalCollapsed) onToggleCollapse();
                        requestAnimationFrame(() => document.getElementById(`sidebar-group-${group.id}`)?.scrollIntoView({ block: "nearest" }));
                      }}
                      className={`flex min-h-10 w-full items-center justify-center rounded-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFBF00] ${groupActive ? "bg-[#174778] text-[#FFBF00]" : "text-[#D7E3EF] hover:bg-[#174778] hover:text-[#FFFCFB]"}`}
                    >
                      <Icon size={19} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <>
                {sidebarGroups.map((group) => {
                  const googleAds = group.id === "knowledgeCenter" ? navById.get("google-ads") : undefined;
                  return (
                    <section id={`sidebar-group-${group.id}`} key={group.id}>
                      <button
                        type="button"
                        aria-expanded={expandedSections[group.id]}
                        onClick={() => setExpandedSections((sections) => ({ ...sections, [group.id]: !sections[group.id] }))}
                        className="flex min-h-9 w-full items-center justify-between px-2.5 pt-2.5 pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#9FB8CE] hover:text-[#FFFCFB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFBF00]"
                      >
                        <span>{group.label}</span>
                        {expandedSections[group.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>
                      {expandedSections[group.id] && (
                        <div className="space-y-0.5">
                          {group.items.map((item) => {
                            if (item.id === "google-ads") {
                              return navById.has("performance-marketing")
                                ? null
                                : renderDisclosureGroup("Performance Marketing", "performanceMarketing", [item]);
                            }
                            if (item.id === "performance-marketing" && googleAds) {
                              return renderDisclosureItem(item, "performanceMarketing", [googleAds]);
                            }
                            return renderNavItem(item);
                          })}
                        </div>
                      )}
                    </section>
                  );
                })}

                {hasToolsItems && (
                  <section id="sidebar-group-tools">
                    <button
                      type="button"
                      aria-expanded={expandedSections.tools}
                      onClick={() => setExpandedSections((sections) => ({ ...sections, tools: !sections.tools }))}
                      className="flex min-h-9 w-full items-center justify-between px-2.5 pt-2.5 pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[#9FB8CE] hover:text-[#FFFCFB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFBF00]"
                    >
                      <span>Tools</span>
                      {expandedSections.tools ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                    {expandedSections.tools && (
                      <div className="space-y-0.5">
                        {meetingsItem && renderNavItem(meetingsItem)}
                        {mapsItem && renderNavItem(mapsItem)}
                        {bscItem && renderNavItem(bscItem)}
                      </div>
                    )}
                  </section>
                )}
              </>
            )}
          </nav>
        </div>

        {/* Workspace and account actions */}
        <div className="border-t border-[#31577D] bg-[#002A55]">
          {isProjectAdmin && !effectiveCollapsed && <button type="button" onClick={() => onSelectView("forms-admin")} title="Settings" aria-current={currentView === "forms-admin" ? "page" : undefined} className={`w-full flex items-center gap-3 px-4 py-2.5 border-b border-[#31577D] text-xs font-normal transition-colors ${currentView === "forms-admin" ? "text-[#FFBF00] bg-[#174778]" : "text-[#D7E3EF] hover:text-[#FFFCFB] hover:bg-[#174778]"}`}><Settings size={17} /><span>Settings</span></button>}
          {/* Workspace Name Header */}
          {!effectiveCollapsed ? (
            <div className="px-3.5 pt-2.5 pb-2 border-b border-[#31577D]/80 flex items-center justify-between overflow-hidden">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="w-1.5 h-1.5 bg-[#FFBF00] shrink-0"></span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#FFBF00] truncate">
                  {user?.workspaceName || "Mosaic Workspace"}
                </span>
              </div>
              <span className="text-[9px] uppercase tracking-widest text-[#9FB8CE] font-semibold shrink-0">
                Workspace
              </span>
            </div>
          ) : null}

          {/* User Account Details */}
          <div className="p-3">
            <div className={`flex min-w-0 items-center ${effectiveCollapsed ? "justify-center" : "gap-2.5"}`}>
              <button
                ref={profileButtonRef}
                type="button"
                aria-label="Open profile menu"
                aria-expanded={isProfileMenuOpen}
                aria-controls="profile-menu"
                title={user?.username || "Profile and account options"}
                onClick={() => setIsProfileMenuOpen((isOpen) => !isOpen)}
                className="flex h-8 w-8 shrink-0 items-center justify-center border border-[#C9A84C]/60 bg-[#174778] text-xs font-bold text-[#FFBF00] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFBF00]"
              >
                {user?.profilePicture ? (
                  <img src={user.profilePicture} alt="" className="h-full w-full object-cover" />
                ) : (
                  user?.initials || "CU"
                )}
              </button>
              {!effectiveCollapsed && (
                <>
                  <div className="min-w-0 flex-1 truncate">
                    <div className="truncate text-xs font-semibold text-white">{user?.username || "ClickUp User"}</div>
                    <div className="truncate text-[10px] text-[#9FB8CE]">{user?.email || "ClickUp Portal"}</div>
                  </div>
                  <button
                    type="button"
                    aria-label="Sign out from ClickUp"
                    title="Sign out from ClickUp"
                    onClick={onSignOut}
                    className="shrink-0 rounded-none p-1.5 text-[#9FB8CE] transition-colors hover:bg-[#174778] hover:text-[#FFBF00] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFBF00]"
                  >
                    <LogOut size={15} />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </aside>
      {isProfileMenuOpen && createPortal(
        <div
          ref={profileMenuRef}
          id="profile-menu"
          className="fixed bottom-3 z-[60] w-[min(15rem,calc(100vw-1rem))] rounded-sm border border-[#31577D] bg-[#002A55] p-3 text-[#FFFCFB] shadow-xl"
          style={{ left: typeof window === "undefined" ? 72 : Math.max(8, Math.min(effectiveCollapsed ? 72 : 228, window.innerWidth - 256)) }}
        >
          <div className="truncate text-xs font-semibold">{user?.username || "ClickUp User"}</div>
          <div className="mt-1 truncate text-[10px] text-[#9FB8CE]">{user?.email || "ClickUp Portal"}</div>
          <button
            type="button"
            onClick={() => {
              setIsProfileMenuOpen(false);
              onSignOut?.();
            }}
            className="mt-3 flex w-full items-center gap-2 border-t border-[#31577D] px-1 pt-2 text-left text-xs text-[#D7E3EF] hover:text-[#FFBF00] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FFBF00]"
          >
            <LogOut size={15} />
            Sign out from ClickUp
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
