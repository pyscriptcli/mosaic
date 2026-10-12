"use client";

import { useState } from "react";
import MyDayView from "@/components/MyDayView";
import TasksView from "@/components/TasksView";

type Props = {
  userId?: string;
  currentUserName?: string;
  onNavigateToMeetings?: () => void;
  onSelectMeeting?: (meetingTitle: string) => void;
  focusedTaskId?: string | null;
  onClearFocusedTask?: () => void;
};

export default function TasksPageView(props: Props) {
  const [tab, setTab] = useState<"my-day" | "tasks">("my-day");
  const tabs = [
    { id: "my-day" as const, label: "My Day" },
    { id: "tasks" as const, label: "Tasks" },
  ];
  return (
    <div className="mx-auto max-w-[1440px] space-y-5 pb-8">
      <div className="border-b border-slate-200">
        <div role="tablist" aria-label="Tasks views" className="flex gap-1">
          {tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`min-h-11 border-b-2 px-4 text-xs font-semibold uppercase tracking-wide ${tab === item.id ? "border-[#C9A84C] text-[#003366]" : "border-transparent text-slate-500 hover:text-[#003366]"}`}>{item.label}</button>)}
        </div>
      </div>
      {tab === "my-day" ? <MyDayView userId={props.userId} currentUserName={props.currentUserName} /> : <TasksView
        userId={props.userId}
        onNavigateToMeetings={props.onNavigateToMeetings}
        onSelectMeeting={props.onSelectMeeting}
        focusedTaskId={props.focusedTaskId}
        onClearFocusedTask={props.onClearFocusedTask}
      />}
    </div>
  );
}
