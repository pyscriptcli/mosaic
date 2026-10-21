import type { ReactNode } from "react";

export type MeetingWorkspaceTab = "summary" | "discussion" | "actions" | "notes" | "transcript";

interface MeetingWorkspaceTabsProps {
  value: MeetingWorkspaceTab;
  onChange: (tab: MeetingWorkspaceTab) => void;
  children?: ReactNode;
  compact?: boolean;
}

const tabs: { id: MeetingWorkspaceTab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "discussion", label: "Discussion Points" },
  { id: "actions", label: "Action Items" },
  { id: "notes", label: "Meeting Notes" },
  { id: "transcript", label: "Transcript" },
];

export function MeetingWorkspaceTabs({ value, onChange, children, compact = false }: MeetingWorkspaceTabsProps) {
  return (
    <div>
      <div className="flex border-b border-[#003366]/20 bg-[#FFFCFB]" role="tablist" aria-label="Meeting workspace">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={value === tab.id}
            onClick={() => onChange(tab.id)}
            className={`${compact ? "px-5 py-2.5" : "px-5 py-3"} text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer border-b-2 ${
              value === tab.id
                ? "border-[#003366] text-[#003366] bg-white"
                : "border-transparent text-gray-400 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
