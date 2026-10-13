"use client";

import React from "react";
import { MosaicBrand } from "@/components/MosaicBrand";
import {
  LayoutGrid,
  Folder,
  FileText,
  CalendarDays,
  Mic,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  LogOut,
  Settings,
  NotebookTabs,
  ClipboardCheck,
  ChartNoAxesColumnIncreasing,
  BriefcaseBusiness,
  Map,
} from "lucide-react";

export type NavView = "dashboard" | "project" | "tasks" | "notebook" | "reports" | "market-insights" | "demands" | "meetings" | "minutes" | "maps" | "forms" | "delta" | "business-analysis" | "forms-admin";

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
  const [isPinned, setIsPinned] = React.useState(false);
  const [expandedSections, setExpandedSections] = React.useState({
    personal: true,
    workspaces: true,
    monitoring: true,
    tools: true,
    meetings: true,
  });
  const hoverTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

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

  // Auto-collapsed when pointer is not hovering; auto-expanded when hovering
  const effectiveCollapsed = isPinned ? false : !isHovered;

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
      icon: ChartNoAxesColumnIncreasing,
      badge: null
    },
    {
      id: "meetings" as NavView,
      label: "Meetings",
      icon: CalendarDays,
      badge: null
    },
    {
      id: "minutes" as NavView,
      label: "Notetaker",
      icon: Mic,
    },
    { id: "maps" as NavView, label: "Maps", icon: Map, badge: null },
    {
      id: "notebook" as NavView,
      label: "Notebook",
      icon: NotebookTabs,
      badge: null
    },
  ];

  const orderIndex = new Map((sidebarOrder || []).map((id, index) => [id, index]));
  const navItems = allNavItems.slice().sort((a, b) => {
    const fallback = allNavItems.length;
    return (orderIndex.get(a.id) ?? fallback) - (orderIndex.get(b.id) ?? fallback);
  }).filter((item) => Boolean(
    item.id === "maps" ||
    allowedPages?.includes(item.id) ||
    (item.id === "notebook" && allowedPages?.includes("tasks")) ||
    (item.id === "project" && allowedPages?.includes("tasks")) ||
    (item.id === "delta" && (allowedPages?.includes("project") || allowedPages?.includes("tasks")))
  ));

  const navById = new Map(navItems.map((item) => [item.id, item]));
  const sidebarGroups = [
    { id: "personal" as const, label: "Personal Workspace", itemIds: ["business-analysis"] as NavView[] },
    { id: "workspaces" as const, label: "Workspaces", itemIds: ["dashboard", "project", "delta", "notebook"] as NavView[] },
    { id: "monitoring" as const, label: "Monitoring", itemIds: ["demands", "market-insights", "reports"] as NavView[] },
  ].map((group) => ({
    ...group,
    items: group.itemIds
      .map((id) => navById.get(id))
      .filter((item): item is (typeof navItems)[number] => Boolean(item))
      .sort((a, b) => (orderIndex.get(a.id) ?? allNavItems.length) - (orderIndex.get(b.id) ?? allNavItems.length)),
  })).filter((group) => group.items.length > 0);
  const meetingsItem = navById.get("meetings");
  const notetakerItem = navById.get("minutes");
  const mapsItem = navById.get("maps");
  const hasToolsItems = Boolean(meetingsItem || notetakerItem || mapsItem);

  const renderNavItem = (item: (typeof navItems)[number], nested = false) => {
    const Icon = item.icon;
    const isActive = currentView === item.id || (item.id === "notebook" && currentView === "tasks");
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onSelectView(item.id)}
        onPointerEnter={() => onPreloadView?.(item.id)}
        onFocus={() => onPreloadView?.(item.id)}
        title={effectiveCollapsed ? item.label : undefined}
        className={`w-full flex items-center gap-2.5 ${nested ? "pl-4" : "px-2.5"} py-2 text-[13px] font-normal transition-colors cursor-pointer ${
          isActive
            ? "bg-[#FFFCFB] text-[#003366] border-l-4 border-[#C9A84C]"
            : "text-[#FFFCFB] hover:bg-[#174778] border-l-4 border-transparent"
        } ${effectiveCollapsed ? "justify-center !ml-0 !w-full !px-0" : ""}`}
      >
        <Icon size={18} className={`shrink-0 ${isActive ? "text-[#C9A84C]" : "text-[#D7E3EF]"}`} />
        {!effectiveCollapsed && <span className="truncate">{item.label}</span>}
      </button>
    );
  };

  return (
    <div
      className={`relative h-full z-40 shrink-0 transition-all duration-300 ease-in-out ${
        isPinned ? "w-56 min-w-[224px]" : "w-16 min-w-[64px]"
      }`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <aside 
        className={`absolute top-0 left-0 h-full flex flex-col justify-between bg-[#003366] text-[#FFFCFB] border-r border-[#31577D] shadow-[4px_0_24px_rgba(0,51,102,0.18)] transition-all duration-300 ease-in-out z-40 select-none overflow-hidden ${
          effectiveCollapsed ? "w-16 min-w-[64px]" : "w-56 min-w-[224px]"
        }`}
      >
        {/* Mosaic identity stays visible when the navigation is collapsed. */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className={`h-14 shrink-0 flex items-center border-b border-[#31577D] ${effectiveCollapsed ? "justify-center px-2" : "justify-between px-3.5"}`}>
            <MosaicBrand compact={effectiveCollapsed} size={effectiveCollapsed ? "small" : "medium"} className="text-[#FFFCFB]" />

            {!effectiveCollapsed && (
              <button
                type="button"
                onClick={() => {
                  setIsPinned(!isPinned);
                  if (onToggleCollapse) onToggleCollapse();
                }}
                aria-label={isPinned ? "Unpin sidebar (auto-collapse)" : "Pin sidebar expanded"}
                title={isPinned ? "Unpin sidebar (auto-collapse on leave)" : "Pin sidebar expanded"}
                className="p-1.5 rounded-none hover:bg-[#174778] text-[#D7E3EF] hover:text-[#FFBF00] transition-colors cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
            )}
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
            {sidebarGroups.map((group) => (
              <section key={group.id}>
                {!effectiveCollapsed && (
                  <button
                    type="button"
                    aria-expanded={expandedSections[group.id]}
                    onClick={() => setExpandedSections((sections) => ({ ...sections, [group.id]: !sections[group.id] }))}
                    className="flex w-full items-center justify-between px-2.5 pt-3 pb-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[#9FB8CE] hover:text-[#FFFCFB]"
                  >
                    <span>{group.label}</span>
                    {expandedSections[group.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>
                )}
                {(effectiveCollapsed || expandedSections[group.id]) && (
                  <div className="space-y-1">
                    {group.items.map((item) => renderNavItem(item))}
                  </div>
                )}
              </section>
            ))}

            {hasToolsItems && (
              <section>
                {!effectiveCollapsed && (
                  <button
                    type="button"
                    aria-expanded={expandedSections.tools}
                    onClick={() => setExpandedSections((sections) => ({ ...sections, tools: !sections.tools }))}
                    className="flex w-full items-center justify-between px-2.5 pt-3 pb-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[#9FB8CE] hover:text-[#FFFCFB]"
                  >
                    <span>Tools</span>
                    {expandedSections.tools ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>
                )}
                {(effectiveCollapsed || expandedSections.tools) && (
                  <div className="space-y-1">
                    {meetingsItem && (
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={() => onSelectView("meetings")}
                          title={effectiveCollapsed ? "Meetings" : undefined}
                          className={`flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2 text-xs font-normal uppercase tracking-[0.15em] transition-colors ${
                            currentView === "meetings" ? "text-[#FFFCFB]" : "text-[#9FB8CE] hover:text-[#FFFCFB]"
                          } ${effectiveCollapsed ? "justify-center px-0" : ""}`}
                        >
                          <CalendarDays size={18} className="shrink-0" />
                          {!effectiveCollapsed && <span className="truncate">Meetings</span>}
                        </button>
                        {!effectiveCollapsed && notetakerItem && (
                          <button
                            type="button"
                            aria-expanded={expandedSections.meetings}
                            aria-label={expandedSections.meetings ? "Collapse meeting tools" : "Expand meeting tools"}
                            onClick={() => setExpandedSections((sections) => ({ ...sections, meetings: !sections.meetings }))}
                            className="p-1.5 text-[#9FB8CE] hover:text-[#FFFCFB]"
                          >
                            {expandedSections.meetings ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          </button>
                        )}
                      </div>
                    )}
                    {(effectiveCollapsed || expandedSections.meetings) && notetakerItem && (
                      <div className={effectiveCollapsed ? "" : "ml-3 border-l border-[#31577D]"}>
                        {renderNavItem(notetakerItem, true)}
                      </div>
                    )}
                    {!meetingsItem && notetakerItem && renderNavItem(notetakerItem)}
                    {mapsItem && renderNavItem(mapsItem)}
                  </div>
                )}
              </section>
            )}
          </nav>
        </div>

        {/* Bottom Workspace & User Profile Section (#1b1d1e) */}
        <div className="border-t border-[#31577D] bg-[#002A55]">
          {isProjectAdmin && <button type="button" onClick={() => onSelectView("forms-admin")} title="Settings" className={`w-full flex items-center gap-3 px-4 py-2.5 border-b border-[#31577D] text-xs font-normal transition-colors ${currentView === "forms-admin" ? "text-[#FFBF00] bg-[#174778]" : "text-[#D7E3EF] hover:text-[#FFFCFB] hover:bg-[#174778]"} ${effectiveCollapsed ? "justify-center px-0" : ""}`}><Settings size={17} />{!effectiveCollapsed && <span>Settings</span>}</button>}
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
            {!effectiveCollapsed ? (
              <div className="flex items-center justify-between whitespace-nowrap overflow-hidden">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  {user?.profilePicture ? (
                    <img
                      src={user.profilePicture}
                      alt={user.username || "User"}
                      className="w-8 h-8 rounded-none border border-[#C9A84C]/60 object-cover shrink-0"
                    />
                  ) : (
                    <div
                      style={user?.color ? { borderColor: user.color } : undefined}
                      className="w-8 h-8 rounded-none bg-[#174778] border border-[#C9A84C]/60 flex items-center justify-center text-xs font-bold text-[#FFBF00] shrink-0"
                    >
                      {user?.initials || "CU"}
                    </div>
                  )}
                  <div className="truncate">
                    <div className="text-xs font-semibold text-white truncate">
                      {user?.username || "ClickUp User"}
                    </div>
                    <div className="text-[10px] text-[#9FB8CE] truncate">
                      {user?.email || "ClickUp Portal"}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  title="Sign out from ClickUp"
                  onClick={onSignOut}
                  className="p-1.5 text-[#9FB8CE] hover:text-[#FFBF00] hover:bg-[#174778] rounded-none transition-colors cursor-pointer shrink-0"
                >
                  <LogOut size={15} />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-1">
                {user?.profilePicture ? (
                  <img
                    src={user.profilePicture}
                    alt={user.username || "User"}
                    title={user.username || "User"}
                    className="w-8 h-8 rounded-none border border-[#C9A84C]/60 object-cover shrink-0"
                  />
                ) : (
                  <div 
                    title={user?.username || "ClickUp User"}
                    style={user?.color ? { borderColor: user.color } : undefined}
                    className="w-8 h-8 rounded-none bg-[#174778] border border-[#C9A84C]/60 flex items-center justify-center text-xs font-bold text-[#FFBF00]"
                  >
                    {user?.initials || "CU"}
                  </div>
                )}
                <button
                  type="button"
                  title="Sign out from ClickUp"
                  onClick={onSignOut}
                  className="p-1 text-[#9FB8CE] hover:text-[#FFBF00] transition-colors rounded-none cursor-pointer"
                >
                  <LogOut size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
