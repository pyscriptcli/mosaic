"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Bell, BellOff, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, ExternalLink, LoaderCircle, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import { getStoredClickUpListId, getStoredClickUpToken } from "@/lib/api";
import { NotebookView } from "@/components/NotebookView";

type DayTask = {
  id: string; name: string; description: string; status: string; completed: boolean;
  priority: "urgent" | "high" | "normal" | "low"; dueDate: string; url: string;
};
type DayPayload = {
  date: string; dayTask: { id: string; name: string; url: string } | null; tasks: DayTask[];
  notes: string; noteTask: { id: string; name: string; url: string } | null;
  personalList: { id: string; name: string } | null; completeStatus: string; openStatus: string; notesError?: string;
};
type Props = { userId?: string; currentUserName?: string };

const todayIso = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const moveDate = (value: string, days: number) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const REMINDER_KEY = "project_echo_my_day_reminders";

function requestHeaders(personalList?: { id: string; name: string } | null) {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = getStoredClickUpToken();
  const listId = getStoredClickUpListId();
  if (token) headers.set("x-clickup-token", token);
  if (listId) headers.set("x-clickup-list-id", listId);
  if (personalList?.id) {
    headers.set("x-personal-list-id", personalList.id);
    headers.set("x-personal-list-name", personalList.name);
  }
  return headers;
}

export default function MyDayView({ userId, currentUserName }: Props) {
  const [date, setDate] = useState(todayIso);
  const [workspaceTab, setWorkspaceTab] = useState<"my-day" | "activity">("my-day");
  const [payload, setPayload] = useState<DayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(todayIso);
  const [priority, setPriority] = useState<DayTask["priority"]>("normal");
  const [savingTask, setSavingTask] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editDraft, setEditDraft] = useState<Partial<DayTask>>({});
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSave, setNoteSave] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const [noteError, setNoteError] = useState("");
  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState(30);
  const [snoozedUntil, setSnoozedUntil] = useState(0);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [settingsReady, setSettingsReady] = useState(false);
  const [personalList, setPersonalList] = useState<DayPayload["personalList"]>(null);
  const lastReminderAt = useRef(0);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesReady = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = JSON.parse(localStorage.getItem(REMINDER_KEY) || "{}");
        setRemindersEnabled(stored.enabled !== false);
        setReminderMinutes(Math.min(240, Math.max(5, Number(stored.minutes) || 30)));
      } catch { /* use defaults */ }
      setPersonalList({
        id: localStorage.getItem("project_echo_personal_list_id") || "",
        name: localStorage.getItem("project_echo_personal_list_name") || "Personal List",
      });
      lastReminderAt.current = Date.now();
      setSettingsReady(true);
      void fetch("/api/user/preferences", { cache: "no-store" }).then((response) => response.json()).then((body) => {
        const prefs = body.preferences;
        if (prefs?.personal_list_id) {
          const list = { id: String(prefs.personal_list_id), name: String(prefs.personal_list_name || "Personal List") };
          localStorage.setItem("project_echo_personal_list_id", list.id);
          localStorage.setItem("project_echo_personal_list_name", list.name);
          setPersonalList(list);
        }
      }).catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const loadDay = useCallback(async (background = false) => {
    if (background) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/my-day?date=${encodeURIComponent(date)}&personalListId=${encodeURIComponent(personalList?.id || "")}&personalListName=${encodeURIComponent(personalList?.name || "Personal List")}`, { headers: requestHeaders(personalList), cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "My Day could not be loaded.");
      setPayload(body);
      if (body.personalList?.id) setPersonalList((current) => current?.id === body.personalList.id && current?.name === body.personalList.name ? current : body.personalList);
      setNoteDraft(body.notes || "");
      setNoteSave("saved");
      setNoteError(body.notesError || "");
      notesReady.current = true;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "My Day could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [date, personalList?.id, personalList?.name]);

  useEffect(() => {
    const timer = window.setTimeout(() => { notesReady.current = false; void loadDay(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDay]);

  const send = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch("/api/my-day", {
      method: "POST",
      headers: requestHeaders(personalList),
      body: JSON.stringify({ ...body, date }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "ClickUp could not save this change.");
    return result;
  }, [date, personalList]);

  useEffect(() => {
    if (!notesReady.current || noteDraft === (payload?.notes || "")) return;
    if (notesTimer.current) clearTimeout(notesTimer.current);
    setNoteSave("pending");
    notesTimer.current = setTimeout(async () => {
      setNoteSave("saving");
      setNoteError("");
      try {
        const result = await send({ action: "note", notes: noteDraft });
        setPayload((current) => current ? { ...current, notes: noteDraft, noteTask: result.noteTask || current.noteTask } : current);
        setNoteSave("saved");
      } catch (saveError) {
        setNoteSave("error");
        setNoteError(saveError instanceof Error ? saveError.message : "Notes could not be saved.");
      }
    }, 700);
    return () => { if (notesTimer.current) clearTimeout(notesTimer.current); };
  }, [noteDraft, payload?.notes, send]);

  const tasks = payload?.tasks || [];
  const remaining = tasks.filter((task) => !task.completed).length;
  const completed = tasks.length - remaining;

  const notify = useCallback((title: string, body: string) => {
    if (typeof window === "undefined") return;
    if ("Notification" in window && Notification.permission === "granted") {
      try { new Notification(title, { body, tag: "project-echo-my-day" }); } catch { /* in-app reminder remains available */ }
    }
  }, []);

  const openReminder = useCallback(() => {
    setReminderOpen(true);
    lastReminderAt.current = Date.now();
    notify("My Day reminder", tasks.filter((task) => !task.completed).map((task) => task.name).slice(0, 5).join(" · ") || "Review your day.");
  }, [notify, tasks]);

  useEffect(() => {
    if (!remindersEnabled || date !== todayIso()) return;
    const timer = setInterval(() => {
      const now = Date.now();
      if (snoozedUntil) {
        if (now >= snoozedUntil) { setSnoozedUntil(0); openReminder(); }
        return;
      }
      const elapsed = now - lastReminderAt.current;
      const interval = reminderOpen ? 2 : reminderMinutes;
      if (elapsed >= interval * 60_000) openReminder();
    }, 20_000);
    return () => clearInterval(timer);
  }, [date, remindersEnabled, reminderMinutes, reminderOpen, snoozedUntil, openReminder]);

  useEffect(() => {
    localStorage.setItem(REMINDER_KEY, JSON.stringify({ enabled: remindersEnabled, minutes: reminderMinutes }));
  }, [settingsReady, remindersEnabled, reminderMinutes]);

  const saveTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSavingTask(true);
    setError("");
    try {
      await send({ action: "create", name: name.trim(), description, dueDate, priority });
      setName(""); setDescription(""); setDueDate(date); setPriority("normal");
      await loadDay(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Task could not be created.");
    } finally { setSavingTask(false); }
  };

  const updateTask = async (taskId: string, changes: Record<string, unknown>) => {
    setError("");
    try { await send({ action: "update", taskId, ...changes }); await loadDay(true); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Task could not be updated."); }
  };

  const deleteTask = async (taskId: string) => {
    setError("");
    try { await send({ action: "delete", taskId }); await loadDay(true); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Task could not be deleted."); }
  };

  const enableReminders = async () => {
    if (remindersEnabled && "Notification" in window && Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") setNotice("Browser notifications are off. My Day will still show reminders while it is open.");
      return;
    }
    if (!remindersEnabled && "Notification" in window && Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") setNotice("Browser notifications are off. My Day will still show reminders while it is open.");
    }
    setRemindersEnabled(!remindersEnabled);
    lastReminderAt.current = Date.now();
  };

  const reminderTitle = useMemo(() => tasks.filter((task) => !task.completed).map((task) => task.name), [tasks]);

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 pb-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Tasks · Daily workspace</p>
          <h1 className="mt-1 font-serif text-3xl italic text-[#003366]">My Day</h1>
          <p className="mt-1 text-sm text-slate-500">Plan today, capture notes, and keep the daily log in sync.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-10 items-center gap-2 border border-slate-300 bg-[#FFFCFB] px-3 text-xs text-slate-600">
            <Clock3 size={14} className="text-[#003366]" />
            <span>Remind every</span>
            <select value={reminderMinutes} onChange={(event) => setReminderMinutes(Number(event.target.value))} className="bg-transparent font-semibold text-[#003366] outline-none" aria-label="Reminder interval">
              {[5, 10, 15, 30, 45, 60, 90, 120, 180, 240].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
            </select>
          </label>
          <button type="button" onClick={enableReminders} aria-pressed={remindersEnabled} className={`inline-flex h-10 items-center gap-2 border px-3 text-xs font-semibold ${remindersEnabled ? "border-[#003366] bg-[#003366] text-white" : "border-slate-300 bg-[#FFFCFB] text-[#003366] hover:border-[#C9A84C]"}`}>
            {remindersEnabled ? <Bell size={15} /> : <BellOff size={15} />}{remindersEnabled ? "Reminders on" : "Enable reminders"}
          </button>
          <button type="button" onClick={() => void loadDay(true)} disabled={refreshing} className="inline-flex h-10 items-center gap-2 border border-slate-300 bg-[#FFFCFB] px-3 text-xs font-semibold text-[#003366] hover:border-[#C9A84C] disabled:opacity-50">
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </header>

      <div role="tablist" aria-label="My Day workspace" className="flex border-b border-slate-200">
        {([{ id: "my-day", label: "Today" }, { id: "activity", label: "Daily activity" }] as const).map((item) => <button key={item.id} type="button" role="tab" aria-selected={workspaceTab === item.id} onClick={() => setWorkspaceTab(item.id)} className={`min-h-11 border-b-2 px-4 text-xs font-semibold uppercase tracking-wide ${workspaceTab === item.id ? "border-[#C9A84C] text-[#003366]" : "border-transparent text-slate-500 hover:text-[#003366]"}`}>{item.label}</button>)}
      </div>

      {workspaceTab === "activity" ? <NotebookView key={date} currentUserName={currentUserName} userId={userId} initialDate={date} /> : <>
      <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-[#FFFCFB] p-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setDate(moveDate(date, -1))} aria-label="Previous day" className="grid h-10 w-10 place-items-center border border-slate-200 text-slate-600 hover:text-[#003366]"><ChevronLeft size={17} /></button>
          <button type="button" onClick={() => setDate(todayIso())} className="h-10 border border-slate-200 px-4 text-xs font-semibold text-[#003366] hover:border-[#C9A84C]">Today</button>
          <button type="button" onClick={() => setDate(moveDate(date, 1))} aria-label="Next day" className="grid h-10 w-10 place-items-center border border-slate-200 text-slate-600 hover:text-[#003366]"><ChevronRight size={17} /></button>
          <label className="ml-2 flex h-10 items-center gap-2 border border-slate-300 px-3 text-sm text-[#003366]">
            <CalendarDays size={15} /><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="bg-transparent outline-none" aria-label="Select day" />
          </label>
        </div>
        <a href={payload?.dayTask?.url || "https://app.clickup.com/9014981136/v/l/901418075633"} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 border border-[#003366] px-3 text-xs font-semibold uppercase tracking-wide text-[#003366] hover:bg-[#003366] hover:text-white">
          KPI Monitoring <ExternalLink size={13} />
        </a>
      </div>

      {notice && <div role="status" className="flex items-start justify-between gap-3 border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900"><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Dismiss notification note"><X size={14} /></button></div>}
      {error && <div role="alert" className="flex items-start gap-2 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</div>}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["Tasks", tasks.length, "planned for this date"],
          ["Open", remaining, "still to do"],
          ["Done", completed, "completed"],
        ].map(([label, value, detail]) => <div key={String(label)} className="border border-slate-200 bg-[#FFFCFB] p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
          <div className="mt-1 font-serif text-3xl text-[#003366]">{value}</div>
          <div className="mt-1 text-xs text-slate-400">{detail}</div>
        </div>)}
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <section className="space-y-4 xl:col-span-8">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="font-serif text-xl italic text-[#003366]">{dateLabel(date)}</h2><p className="mt-1 text-xs text-slate-500">{currentUserName || "Personal schedule"}</p></div>
            {loading ? <span className="inline-flex items-center gap-2 text-xs text-slate-400"><LoaderCircle size={14} className="animate-spin" />Loading ClickUp tasks</span> : <span className="border border-slate-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{payload?.dayTask ? "KPI daily record linked" : "Daily record created when you add a task"}</span>}
          </div>

          <form onSubmit={saveTask} className="border border-slate-200 bg-[#FFFCFB] p-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Add a task for this day" aria-label="Task name" className="h-10 min-w-0 flex-1 border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#C9A84C]" />
              <button type="submit" disabled={savingTask || !name.trim()} className="inline-flex h-10 items-center justify-center gap-2 bg-[#003366] px-4 text-xs font-semibold uppercase tracking-wide text-white hover:bg-[#00254a] disabled:opacity-50">
                {savingTask ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={15} />} Add task
              </button>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_160px_145px]">
              <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Details (optional)" aria-label="Task details" className="h-9 border border-slate-200 px-3 text-xs outline-none focus:border-[#C9A84C]" />
              <label className="flex h-9 items-center gap-2 border border-slate-200 px-2 text-[10px] uppercase tracking-wide text-slate-500"><span>Due</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs normal-case tracking-normal text-[#003366] outline-none" /></label>
              <select value={priority} onChange={(event) => setPriority(event.target.value as DayTask["priority"])} aria-label="Task priority" className="h-9 border border-slate-200 bg-white px-2 text-xs text-[#003366] outline-none focus:border-[#C9A84C]">
                <option value="urgent">Urgent priority</option><option value="high">High priority</option><option value="normal">Normal priority</option><option value="low">Low priority</option>
              </select>
            </div>
          </form>

          <div className="border border-slate-200 bg-[#FFFCFB]">
            {loading && !payload ? <div className="flex min-h-28 items-center justify-center text-xs text-slate-400"><LoaderCircle size={15} className="mr-2 animate-spin" />Loading day</div> :
              tasks.length === 0 ? <div className="p-8 text-center"><CheckCircle2 size={24} className="mx-auto text-[#C9A84C]" /><p className="mt-2 font-serif text-lg italic text-[#003366]">A clear day</p><p className="mt-1 text-xs text-slate-500">Tasks added here become subtasks of this day in KPI Monitoring.</p></div> :
                <div className="divide-y divide-slate-200">
                  {tasks.map((task) => <div key={task.id} className={`flex gap-3 p-4 ${task.completed ? "bg-slate-50/70" : "bg-[#FFFCFB]"}`}>
                    <button type="button" onClick={() => void updateTask(task.id, { status: task.completed ? payload?.openStatus : payload?.completeStatus })} aria-label={task.completed ? `Mark ${task.name} incomplete` : `Complete ${task.name}`} className="mt-0.5 text-[#003366]">{task.completed ? <CheckCircle2 size={18} className="text-[#C9A84C]" /> : <span className="block h-[18px] w-[18px] border border-slate-400 hover:border-[#003366]" />}</button>
                    <div className="min-w-0 flex-1">
                      {editingId === task.id ? <div className="space-y-2">
                        <input value={String(editDraft.name || "")} onChange={(event) => setEditDraft((draft) => ({ ...draft, name: event.target.value }))} className="h-9 w-full border border-slate-300 px-2 text-sm outline-none focus:border-[#C9A84C]" aria-label="Edit task name" />
                        <textarea value={String(editDraft.description || "")} onChange={(event) => setEditDraft((draft) => ({ ...draft, description: event.target.value }))} className="min-h-16 w-full resize-y border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-[#C9A84C]" aria-label="Edit task details" />
                        <div className="flex flex-wrap gap-2">
                          <input type="date" value={String(editDraft.dueDate || "")} onChange={(event) => setEditDraft((draft) => ({ ...draft, dueDate: event.target.value }))} className="h-8 border border-slate-200 px-2 text-xs" aria-label="Edit task due date" />
                          <select value={String(editDraft.priority || "normal")} onChange={(event) => setEditDraft((draft) => ({ ...draft, priority: event.target.value as DayTask["priority"] }))} className="h-8 border border-slate-200 bg-white px-2 text-xs" aria-label="Edit task priority"><option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option></select>
                          <button type="button" onClick={async () => { await updateTask(task.id, editDraft); setEditingId(""); }} className="inline-flex h-8 items-center gap-1 bg-[#003366] px-3 text-xs font-semibold text-white"><Save size={13} />Save</button>
                          <button type="button" onClick={() => setEditingId("")} className="h-8 border border-slate-200 px-3 text-xs text-slate-600">Cancel</button>
                        </div>
                      </div> : <>
                        <div className={`font-semibold text-sm ${task.completed ? "text-slate-400 line-through" : "text-[#003366]"}`}>{task.name}</div>
                        {task.description && <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-500">{task.description}</p>}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-wide text-slate-400">
                          <span>{task.priority} priority</span>{task.dueDate && <span>Due {new Date(`${task.dueDate}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                          <a href={task.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#31577D] hover:text-[#003366]">Open task <ExternalLink size={11} /></a>
                        </div>
                      </>}
                    </div>
                    <div className="flex shrink-0 items-start gap-1">
                      {editingId !== task.id && <button type="button" onClick={() => { setEditingId(task.id); setEditDraft({ name: task.name, description: task.description, dueDate: task.dueDate, priority: task.priority }); }} className="h-8 border border-slate-200 px-2 text-[10px] font-semibold text-slate-500 hover:border-[#C9A84C] hover:text-[#003366]">Edit</button>}
                      <button type="button" onClick={() => void deleteTask(task.id)} aria-label={`Delete ${task.name}`} className="grid h-8 w-8 place-items-center border border-slate-200 text-slate-400 hover:border-red-300 hover:text-red-700"><Trash2 size={14} /></button>
                    </div>
                  </div>)}
                </div>}
          </div>
        </section>

        <aside className="space-y-4 xl:col-span-4">
          <section className="border border-slate-200 bg-[#FFFCFB] p-5">
            <div className="flex items-center justify-between gap-2"><h2 className="font-serif text-lg italic text-[#003366]">Day notes</h2><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{noteSave === "saved" ? "Saved to Personal List" : noteSave === "saving" ? "Saving…" : noteSave === "pending" ? "Autosave pending" : "Save failed"}</span></div>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">{personalList?.id ? `Stored as a dated subtask of Notes in ${personalList.name}.` : "Choose a Personal List in Meetings settings to save day notes."}</p>
            <textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Capture decisions, reminders, or thoughts for this day…" rows={9} className="mt-3 w-full resize-y border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700 outline-none focus:border-[#C9A84C]" aria-label="Day notes" />
            {(noteError || payload?.notesError) && <div role="alert" className="mt-2 flex gap-2 text-xs text-red-700"><AlertCircle size={14} className="shrink-0" />{noteError || payload?.notesError}</div>}
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400">{payload?.noteTask ? <a href={payload.noteTask.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#31577D]">Open note task <ExternalLink size={11} /></a> : "First save creates Notes and its dated subtask."}</span>
              <button type="button" onClick={() => { if (notesTimer.current) clearTimeout(notesTimer.current); void send({ action: "note", notes: noteDraft }).then((result) => { setPayload((current) => current ? { ...current, notes: noteDraft, noteTask: result.noteTask || current.noteTask } : current); setNoteSave("saved"); setNoteError(""); }).catch((saveError) => { setNoteSave("error"); setNoteError(saveError instanceof Error ? saveError.message : "Notes could not be saved."); }); }} disabled={noteSave === "saving"} className="inline-flex h-9 items-center gap-2 border border-[#003366] px-3 text-xs font-semibold text-[#003366] hover:bg-[#003366] hover:text-white disabled:opacity-50"><Save size={13} />Save now</button>
            </div>
          </section>
          <section className="border border-slate-200 bg-[#FFFCFB] p-5">
            <h2 className="font-serif text-lg italic text-[#003366]">Daily activity source</h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">Tasks on this day are subtasks of the dated KPI Monitoring record, so they appear in the Notebook daily activity.</p>
            {payload?.dayTask ? <a href={payload.dayTask.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 border border-[#003366] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#003366] hover:bg-[#003366] hover:text-white">Open daily log <ExternalLink size={13} /></a> : <p className="mt-3 text-[11px] text-slate-400">The dated KPI record is created with the first task.</p>}
          </section>
          <section className="border border-slate-200 bg-[#FFFCFB] p-5">
            <h2 className="font-serif text-lg italic text-[#003366]">Reminders</h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">A reminder lists your unfinished tasks and repeats at the selected interval while My Day is open. Browser notifications require permission.</p>
          </section>
        </aside>
      </div>

      </>}

      {reminderOpen && <div className="fixed inset-0 z-[100] grid place-items-center bg-[#003366]/35 p-4" role="presentation">
        <section role="dialog" aria-modal="true" aria-labelledby="my-day-reminder-title" className="w-full max-w-lg border border-slate-300 bg-[#FFFCFB] p-5 shadow-xl">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Reminder</p><h2 id="my-day-reminder-title" className="mt-1 font-serif text-2xl italic text-[#003366]">Check in on your day</h2></div><button type="button" onClick={() => setReminderOpen(false)} aria-label="Close reminder" className="grid h-8 w-8 place-items-center border border-slate-200 text-slate-500"><X size={16} /></button></div>
          <p className="mt-2 text-xs text-slate-500">{reminderTitle.length ? `${reminderTitle.length} unfinished task${reminderTitle.length === 1 ? "" : "s"} remaining.` : "You have no unfinished tasks. Review your notes or plan ahead."}</p>
          <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto">{reminderTitle.map((title) => <li key={title} className="border-l-2 border-[#C9A84C] py-1 pl-3 text-sm text-[#003366]">{title}</li>)}</ul>
          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
            {[5, 15, 30].map((minutes) => <button key={minutes} type="button" onClick={() => { const until = Date.now() + minutes * 60_000; setSnoozedUntil(until); setReminderOpen(false); }} className="h-9 border border-slate-300 px-3 text-xs font-semibold text-[#003366] hover:border-[#C9A84C]">Snooze {minutes} min</button>)}
            <button type="button" onClick={() => { setReminderOpen(false); lastReminderAt.current = Date.now(); }} className="inline-flex h-9 items-center gap-2 bg-[#003366] px-4 text-xs font-semibold text-white"><Check size={14} />Dismiss</button>
          </div>
        </section>
      </div>}
    </div>
  );
}
