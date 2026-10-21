import type { ReactNode } from "react";

export interface MeetingActionItemRow {
  id: string;
  topicTitle: string;
  evidenceQuote?: string;
  discussionPoint: string;
  actionPlan: string;
  targetDate: string;
  personInCharge: string;
}

type ActionItemField = "discussionPoint" | "actionPlan" | "targetDate" | "personInCharge";

interface MeetingActionItemsTableProps {
  items: MeetingActionItemRow[];
  onChange?: (itemId: string, field: ActionItemField, value: string) => void;
  renderAction?: (item: MeetingActionItemRow) => ReactNode;
}

interface MeetingDiscussionCardProps {
  title: string;
  discussionPoint: string;
  evidenceQuote?: string;
  onTitleChange?: (value: string) => void;
  onDiscussionPointChange?: (value: string) => void;
  children?: ReactNode;
}

const actionColumns: { label: string; field: ActionItemField }[] = [
  { label: "Discussion Point", field: "discussionPoint" },
  { label: "Action Plan", field: "actionPlan" },
  { label: "Target Date", field: "targetDate" },
  { label: "Person in Charge", field: "personInCharge" },
];

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
  onTitleChange,
  onDiscussionPointChange,
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
        <textarea
          aria-label="Discussion point"
          value={discussionPoint}
          onChange={(event) => onDiscussionPointChange(event.target.value)}
          placeholder="Add a short paragraph and bullets for key details or decisions."
          rows={Math.max(3, discussionPoint.split(/\r?\n/).length)}
          className="w-full resize-y border border-gray-200 bg-white p-3 text-sm leading-relaxed text-slate-700 focus:border-[#C9AB4C] focus:outline-none"
        />
      ) : (
        <div className="space-y-2">{renderDiscussionPoint(discussionPoint)}</div>
      )}

      {editable && <p className="text-[11px] text-slate-400">Use a short paragraph followed by bullets for separate points.</p>}
      {children}
    </article>
  );
}

export function MeetingActionItemsTable({ items, onChange, renderAction }: MeetingActionItemsTableProps) {
  if (items.length === 0) {
    return <p className="border border-dashed border-slate-300 bg-white/60 p-6 text-center text-sm text-slate-500">No action items recorded.</p>;
  }

  return (
    <div className="space-y-4">
      {items.map((item, index) => (
        <article key={item.id} className="border border-gray-200/90 bg-[#FFFCFB] p-5 shadow-2xs">
          <header className="mb-3 flex items-center gap-3 border-b border-gray-100 pb-3">
            <span className="font-serif text-xl text-[#C9AB4C]">{String(index + 1).padStart(2, "0")}</span>
            <h4 className="font-serif text-base font-bold italic text-[#003366]">{item.topicTitle || "Discussion"}</h4>
          </header>
          {item.evidenceQuote?.trim() && (
            <section aria-label={`Evidence quote / context reference for ${item.topicTitle || "discussion"}`} className="mb-4 border-l-2 border-[#C9AB4C] py-1 pl-3">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Evidence quote / context reference</p>
              <p className="font-serif text-sm italic leading-relaxed text-slate-600">{item.evidenceQuote}</p>
            </section>
          )}
          <div className="grid grid-cols-1 gap-4 border-t border-gray-100 pt-3 md:grid-cols-2 xl:grid-cols-[1.8fr_1.1fr_0.7fr_0.8fr]">
            {actionColumns.map(({ label, field }) => (
              <section key={field} className="min-w-0">
                <h5 className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{label}</h5>
                {onChange ? field === "targetDate" || field === "personInCharge" ? (
                  <input
                    aria-label={`${label} for ${item.discussionPoint}`}
                    value={item[field]}
                    placeholder={field === "targetDate" ? "TBD" : "Unassigned"}
                    onChange={(event) => onChange(item.id, field, event.target.value)}
                    className="w-full border-b border-gray-300 bg-transparent px-1 py-2 text-sm font-medium text-[#003366] focus:border-[#C9AB4C] focus:outline-none"
                  />
                ) : (
                  <textarea
                    aria-label={`${label} for ${item.discussionPoint}`}
                    value={item[field]}
                    onChange={(event) => onChange(item.id, field, event.target.value)}
                    rows={Math.max(2, item[field].split(/\r?\n/).length)}
                    className={`w-full resize-y border border-gray-200 bg-white p-2.5 text-sm leading-relaxed text-[#003366] focus:border-[#C9AB4C] focus:outline-none ${field === "discussionPoint" ? "border-[#C9AB4C]" : ""}`}
                  />
                ) : <p className="min-h-10 whitespace-pre-line border border-gray-200 bg-white p-2.5 text-sm leading-relaxed text-[#003366]">{item[field] || "—"}</p>}
              </section>
            ))}
          </div>
          <footer className="mt-4 flex justify-end border-t border-gray-100 pt-3">{renderAction?.(item)}</footer>
        </article>
      ))}
    </div>
  );
}
