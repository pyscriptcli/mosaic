import type { ReactNode } from "react";

export interface MeetingActionItemRow {
  id: string;
  topicTitle: string;
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
    <div className="overflow-x-auto border border-gray-200 bg-white">
      <table className="w-full min-w-[760px] border-collapse text-left text-xs">
        <thead className="bg-[#003366] text-white">
          <tr>
            {actionColumns.map(({ label }) => (
              <th key={label} scope="col" className="border border-[#003366] px-3 py-2.5 font-semibold">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.id} className={index % 2 === 0 ? "bg-white" : "bg-[#FAF9F7]"}>
              {actionColumns.map(({ field }) => (
                <td key={field} className="align-top border border-gray-200 px-3 py-2.5 text-slate-700">
                  {field === "discussionPoint" && item.topicTitle && <p className="mb-1 font-semibold text-[#003366]">{item.topicTitle}</p>}
                  {onChange ? field === "targetDate" || field === "personInCharge" ? (
                    <input
                      aria-label={`${actionColumns.find((column) => column.field === field)?.label} for ${item.discussionPoint}`}
                      value={item[field]}
                      onChange={(event) => onChange(item.id, field, event.target.value)}
                      className="w-full min-w-24 border border-gray-200 bg-white px-2 py-1.5 focus:border-[#C9AB4C] focus:outline-none"
                    />
                  ) : (
                    <textarea
                      aria-label={`${actionColumns.find((column) => column.field === field)?.label} for ${item.discussionPoint}`}
                      value={item[field]}
                      onChange={(event) => onChange(item.id, field, event.target.value)}
                      rows={Math.max(2, item[field].split(/\r?\n/).length)}
                      className="w-full min-w-36 resize-y border border-gray-200 bg-white px-2 py-1.5 leading-relaxed focus:border-[#C9AB4C] focus:outline-none"
                    />
                  ) : <span className="block whitespace-pre-line leading-relaxed">{item[field] || "—"}</span>}
                  {field === "actionPlan" && renderAction?.(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
