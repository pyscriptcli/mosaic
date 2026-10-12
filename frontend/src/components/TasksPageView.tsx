"use client";

import { useState } from "react";
import MyDayView from "@/components/MyDayView";
import TasksView from "@/components/TasksView";
import { NotebookView } from "@/components/NotebookView";

type WorkspaceTab = "my-day" | "all-tasks" | "week" | "dashboard";
type Props = {
  userId?: string;
  currentUserName?: string;
  onNavigateToMeetings?: () => void;
  onSelectMeeting?: (meetingTitle: string) => void;
  focusedTaskId?: string | null;
  onClearFocusedTask?: () => void;
  currentView: "notebook" | "tasks";
  canAccessTasks: boolean;
  canAccessNotebook: boolean;
};

export default function TasksPageView(props: Props) {
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
  });
  const firstTab: WorkspaceTab = props.canAccessTasks
    ? props.currentView === "tasks" ? "all-tasks" : "my-day"
    : "week";
  const [tab, setTab] = useState<WorkspaceTab>(firstTab);
  const tabs: Array<{ id: WorkspaceTab; label: string }> = [
    ...(props.canAccessTasks ? [{ id: "my-day" as const, label: "My Day" }, { id: "all-tasks" as const, label: "All Tasks" }] : []),
    ...(props.canAccessNotebook ? [{ id: "week" as const, label: "Week" }, { id: "dashboard" as const, label: "Dashboard" }] : []),
  ];

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 pb-8">
      <header className="border-b border-[#003366]/15 pb-3">
        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#31577D]">Mosaic workspace</p>
        <h1 className="mt-0.5 font-serif text-2xl font-bold italic text-[#003366]">Notebook</h1>
        <p className="mt-1 text-sm text-slate-600">Plan your day, capture activity, and review work in one place.</p>
      </header>
      <div role="tablist" aria-label="Notebook views" className="flex flex-wrap border-b border-slate-200">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={"min-h-11 border-b-2 px-4 text-xs font-semibold " + (tab === item.id ? "border-[#C9A84C] text-[#003366]" : "border-transparent text-slate-500 hover:text-[#003366]")}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "my-day" && props.canAccessTasks && (
        <MyDayView key="my-day" userId={props.userId} currentUserName={props.currentUserName} initialDate={selectedDate} onDateChange={setSelectedDate} showDailyActivity={props.canAccessNotebook} />
      )}
      {tab === "all-tasks" && props.canAccessTasks && (
        <TasksView
          userId={props.userId}
          onNavigateToMeetings={props.onNavigateToMeetings}
          onSelectMeeting={props.onSelectMeeting}
          focusedTaskId={props.focusedTaskId}
          onClearFocusedTask={props.onClearFocusedTask}
        />
      )}
      {tab === "week" && props.canAccessNotebook && (
        <NotebookView key="week" currentUserName={props.currentUserName} userId={props.userId} initialTab="week" hideViewTabs hidePageTitle onOpenDay={(date) => { setSelectedDate(date); setTab("my-day"); }} />
      )}
      {tab === "dashboard" && props.canAccessNotebook && (
        <NotebookView key="dashboard" currentUserName={props.currentUserName} userId={props.userId} initialTab="insights" hideViewTabs hidePageTitle />
      )}
    </div>
  );
}
