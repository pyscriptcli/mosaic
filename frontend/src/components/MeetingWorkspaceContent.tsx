import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { SearchableMemberMultiSelect, type ClickUpMember } from "./SearchableMemberSelect";

export function useMeetingAssignees(enabled: boolean) {
  const [members, setMembers] = useState<ClickUpMember[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/meeting-assignees", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Unable to load ClickUp members")))
      .then((data) => { if (!cancelled) setMembers(data.members || []); })
      .catch(() => { if (!cancelled) setMembers([]); });
    return () => { cancelled = true; };
  }, [enabled]);
  return members;
}

export interface MeetingActionItemRow {
  id: string;
  discussionPointId: string;
  discussionPointTitle: string;
  discussionPoint: string;
  actionPlan: string;
  targetDate: string;
  personInCharge: string;
  assigneeId?: string;
  assigneeIds?: string[];
}

type ActionItemField = "actionPlan" | "targetDate" | "personInCharge";

interface MeetingActionItemsTableProps {
  items: MeetingActionItemRow[];
  members?: ClickUpMember[];
  onChange?: (itemId: string, field: ActionItemField, value: string, assigneeIds?: string[]) => void;
  renderAction?: (item: MeetingActionItemRow) => ReactNode;
}

interface MeetingDiscussionCardProps {
  title: string;
  discussionPoint: string;
  evidenceQuote?: string;
  actionCount?: number;
  onTitleChange?: (value: string) => void;
  onDiscussionPointChange?: (value: string) => void;
  onAddAction?: () => void;
  children?: ReactNode;
}

const actionFields: { label: string; field: ActionItemField }[] = [
  { label: "Action Plan", field: "actionPlan" },
  { label: "Target Date", field: "targetDate" },
  { label: "Person in Charge", field: "personInCharge" },
];

function AutoResizeTextarea({
  label,
  value,
  onChange,
  placeholder,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.max(44, textarea.scrollHeight)}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={2}
      className={`w-full resize-none overflow-hidden border border-gray-200 bg-white p-2.5 text-sm leading-relaxed text-[#003366] focus:border-[#C9AB4C] focus:outline-none ${className}`}
    />
  );
}

function renderDiscussionPoint(value: string) {
  const blocks: { type: "paragraph" | "list"; lines: string[] }[] = [];

  value.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      const last = blocks.at(-1);
      if (last?.type === "list") last.lines.push(bullet[1]);
      else blocks.push({ type: "list", lines: [bullet[1]] });
      return;
    }

    const last = blocks.at(-1);
    if (last?.type === "paragraph") last.lines[last.lines.length - 1] += ` ${line}`;
    else blocks.push({ type: "paragraph", lines: [line] });
  });

  return blocks.map((block, index) => block.type === "list" ? (
    <ul key={`list-${index}`} className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700">
      {block.lines.map((line, lineIndex) => <li key={lineIndex}>{line}</li>)}
    </ul>
  ) : (
    <p key={`paragraph-${index}`} className="text-sm leading-relaxed text-slate-700">
      {block.lines.join(" ")}
    </p>
  ));
}

export function MeetingDiscussionCard({
  title,
  discussionPoint,
  evidenceQuote = "",
  actionCount = 0,
  onTitleChange,
  onDiscussionPointChange,
  onAddAction,
  children,
}: MeetingDiscussionCardProps) {
  const editable = Boolean(onTitleChange || onDiscussionPointChange);

  return (
    <article className="space-y-3 border border-gray-200/90 bg-[#FFFCFB] p-5 shadow-2xs">
      {onTitleChange ? (
        <input
          aria-label="Discussion topic"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="Topic title"
          className="w-full border-b border-gray-200 bg-transparent py-1 font-serif text-base font-bold italic text-[#003366] focus:border-[#C9AB4C] focus:outline-none"
        />
      ) : (
        <h3 className="font-serif text-base font-bold italic text-[#003366]">{title || "Discussion"}</h3>
      )}

      {evidenceQuote.trim() && (
        <section aria-label="Evidence quote / context reference" className="border-l-2 border-[#C9AB4C] bg-white/70 px-3 py-2">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Evidence quote / context reference</p>
          <p className="font-serif text-sm italic leading-relaxed text-slate-600">{evidenceQuote}</p>
        </section>
      )}

      {onDiscussionPointChange ? (
        <AutoResizeTextarea
          label="Discussion point"
          value={discussionPoint}
          onChange={onDiscussionPointChange}
          placeholder="Add a short paragraph and bullets for key details or decisions."
        />
      ) : (
        <div className="space-y-2">{renderDiscussionPoint(discussionPoint)}</div>
      )}

      {editable && <p className="text-[11px] text-slate-400">Use a short paragraph followed by bullets for separate points.</p>}
      {onAddAction && (
        <div className="flex justify-end border-t border-gray-100 pt-3">
          <button type="button" onClick={onAddAction} className="border border-[#003366]/30 bg-[#FFFCFB] px-3 py-1.5 text-xs font-semibold text-[#003366] transition-colors hover:border-[#003366] hover:bg-blue-50/50">
            {actionCount ? "Add another action item" : "Add as action item"}
          </button>
        </div>
      )}
      {children}
    </article>
  );
}

export function MeetingActionItemsTable({ items, members = [], onChange, renderAction }: MeetingActionItemsTableProps) {
  if (items.length === 0) {
    return <p className="border border-dashed border-slate-300 bg-white/60 p-6 text-center text-sm text-slate-500">No action items recorded.</p>;
  }

  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <article key={item.id} className="border border-gray-200/90 bg-[#FFFCFB] p-5 shadow-2xs">
          <header className="mb-3 flex items-center gap-3 border-b border-gray-100 pb-3">
            <span className="font-serif text-xl text-[#C9AB4C]">{String(index + 1).padStart(2, "0")}</span>
            <h4 className="font-serif text-base font-bold italic text-[#003366]">{item.discussionPointTitle || "Action item"}</h4>
          </header>
          <div className="grid grid-cols-1 gap-4 border-t border-gray-100 pt-3 md:grid-cols-2 xl:grid-cols-[1.8fr_1.1fr_0.7fr_0.8fr]">
            <section className="min-w-0">
              <h5 className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">Discussion Point</h5>
              <p className="min-h-10 whitespace-pre-line border border-gray-200 bg-white p-2.5 text-sm leading-relaxed text-[#003366]">{item.discussionPoint || "Discussion removed"}</p>
            </section>
            {actionFields.map(({ label, field }) => (
              <section key={field} className="min-w-0">
                <h5 className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</h5>
                {field === "actionPlan" ? (
                  onChange ? <AutoResizeTextarea label={label} value={item.actionPlan} onChange={(value) => onChange(item.id, field, value)} />
                    : <p className="min-h-10 whitespace-pre-line border border-gray-200 bg-white p-2.5 text-sm leading-relaxed text-[#003366]">{item.actionPlan || "—"}</p>
                ) : field === "targetDate" ? (
                  onChange ? (
                    <input
                      aria-label={label}
                      type="date"
                      value={item.targetDate}
                      onChange={(event) => onChange(item.id, field, event.target.value)}
                      className="w-full border-b border-gray-300 bg-transparent px-1 py-2 text-sm font-medium text-[#003366] focus:border-[#C9AB4C] focus:outline-none"
                    />
                  ) : <p className="min-h-10 border-b border-gray-300 px-1 py-2 text-sm text-[#003366]">{item.targetDate || "—"}</p>
                ) : (
                  <>
                    {onChange ? (
                      <input
                        aria-label={label}
                        value={item.personInCharge}
                        onChange={(event) => {
                          const names = event.target.value.split(/[,;\n]/).map((name) => name.trim().toLowerCase());
                          const assigneeIds = (item.assigneeIds || (item.assigneeId ? [item.assigneeId] : [])).filter((id) => {
                            const memberName = members.find((member) => String(member.id) === String(id))?.username;
                            return !memberName || names.includes(memberName.toLowerCase());
                          });
                          onChange(item.id, field, event.target.value, assigneeIds);
                        }}
                        placeholder="Enter a name or choose a ClickUp member"
                        className="mb-2 w-full border-b border-gray-300 bg-transparent px-1 py-2 text-sm font-medium text-[#003366] focus:border-[#C9AB4C] focus:outline-none"
                      />
                    ) : <p className="min-h-10 border-b border-gray-300 px-1 py-2 text-sm text-[#003366]">{item.personInCharge || "—"}</p>}
                    {onChange && (
                      <SearchableMemberMultiSelect
                        members={members}
                        selectedMemberIds={item.assigneeIds || (item.assigneeId ? [item.assigneeId] : [])}
                        onChange={(assigneeIds) => {
                          const oldIds = item.assigneeIds || (item.assigneeId ? [item.assigneeId] : []);
                          const oldNames = oldIds.map((id) => members.find((member) => String(member.id) === String(id))?.username).filter((name): name is string => Boolean(name));
                          const freeTextNames = item.personInCharge.split(/[,;\n]/).map((name) => name.trim()).filter((name) => name && !oldNames.some((oldName) => oldName.toLowerCase() === name.toLowerCase()));
                          const selectedNames = assigneeIds.map((id) => members.find((candidate) => String(candidate.id) === String(id))?.username).filter((name): name is string => Boolean(name));
                          const names = [...freeTextNames, ...selectedNames];
                          onChange(item.id, field, names.join(", "), assigneeIds);
                        }}
                        placeholder="Choose ClickUp members"
                        searchPlaceholder="Search ClickUp members..."
                      />
                    )}
                  </>
                )}
              </section>
            ))}
          </div>
          <footer className="mt-4 flex justify-end border-t border-gray-100 pt-3">{renderAction?.(item)}</footer>
        </article>
      ))}
    </div>
  );
}
