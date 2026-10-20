import { useMemo, useState } from "react";
import type { DeltaEntry } from "@/lib/delta/compare";
import { deltaEntryPreview, groupDeltaEntries } from "@/lib/delta/changeGroups";

type Part = { text: string; changed: boolean };

function wordDiff(earlier: string, later: string) {
  const tokenize = (value: string) => value.match(/\s+|[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*|[^\s]/gu) || [];
  const left = tokenize(earlier);
  const right = tokenize(later);
  if (left.length * right.length > 1_440_000) return { left: [{ text: earlier, changed: true }], right: [{ text: later, changed: true }] };
  const lengths = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i -= 1) for (let j = right.length - 1; j >= 0; j -= 1) {
    lengths[i][j] = left[i] === right[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
  }
  const original: Part[] = [];
  const revised: Part[] = [];
  const push = (parts: Part[], text: string, changed: boolean) => {
    const last = parts[parts.length - 1];
    if (last?.changed === changed) last.text += text;
    else parts.push({ text, changed });
  };
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      push(original, left[i], false); push(revised, right[j], false); i += 1; j += 1;
    } else if (i < left.length && (j === right.length || lengths[i + 1][j] >= lengths[i][j + 1])) push(original, left[i++], true);
    else push(revised, right[j++], true);
  }
  return { left: original, right: revised };
}

export function TextResultPanel({ earlierName, laterName, earlierText, laterText, entries, caveat }: {
  earlierName: string;
  laterName: string;
  earlierText: string;
  laterText: string;
  entries: DeltaEntry[];
  caveat?: string;
}) {
  const [index, setIndex] = useState(0);
  const selected = entries[index];
  const changedParts = selected ? wordDiff(selected.originalText, selected.revisedText) : null;
  const changeGroups = useMemo(() => groupDeltaEntries(entries), [entries]);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const selectChange = (nextIndex: number) => {
    setIndex(nextIndex);
    const entry = entries[nextIndex];
    const group = changeGroups.find((candidate) => candidate.entries.some((item) => item.id === entry?.id));
    if (group) setExpandedGroupId(group.id);
  };
  const control = "min-h-9 border border-slate-300 bg-white px-3 text-xs font-semibold text-[#003366] disabled:opacity-40";
  return <section aria-label="Text comparison" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-white p-3">
      <span role="status" aria-live="polite" className="text-xs font-semibold text-[#003366]">{entries.length ? `Change ${index + 1} of ${entries.length}` : caveat ? "No comparable text changes" : "No differences found"}</span>
      <div className="flex gap-2"><button type="button" className={control} disabled={!entries.length || index === 0} onClick={() => selectChange(Math.max(0, index - 1))}>Previous change</button><button type="button" className={control} disabled={!entries.length || index >= entries.length - 1} onClick={() => selectChange(Math.min(entries.length - 1, index + 1))}>Next change</button></div>
    </div>
    {changeGroups.length > 0 && <section aria-label="Section change summaries" className="space-y-2">
      {changeGroups.map((group) => <details key={group.id} open={expandedGroupId === group.id} onToggle={(event) => event.currentTarget.open ? setExpandedGroupId(group.id) : setExpandedGroupId((current) => current === group.id ? null : current)} className={`border bg-white ${group.entries.some((entry) => entry.id === selected?.id) ? "border-[#C9A84C]" : "border-slate-200"}`}>
        <summary className="cursor-pointer p-3 text-left text-xs font-semibold leading-5 text-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366]">
          <span className="ml-1">{group.label}</span><span className="ml-2 text-[10px] font-normal text-slate-500">{group.entries.length} change{group.entries.length === 1 ? "" : "s"}</span>
          <span className="mt-1 block truncate text-[10px] font-normal leading-4 text-slate-600">{deltaEntryPreview(group.entries[0])}{group.entries.length > 1 ? ` · +${group.entries.length - 1} more` : ""}</span>
        </summary>
        <div className="space-y-1 border-t border-slate-100 p-2">{group.entries.map((entry) => {
          const entryIndex = entries.findIndex((candidate) => candidate.id === entry.id);
          return <button key={entry.id} type="button" aria-label={`${entry.section} ${entry.summary}`} aria-pressed={selected?.id === entry.id} onClick={() => selectChange(entryIndex)} className={`block min-h-11 w-full border p-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#003366] ${selected?.id === entry.id ? "border-[#C9A84C] bg-[#FCFAF2]" : "border-transparent hover:border-slate-200"}`}>
            <span className="block text-[9px] font-bold uppercase tracking-wide text-[#31577D]">{entry.summary}</span>
            {entry.originalText && <span className="mt-1 block truncate text-xs leading-5 text-rose-900">Earlier: {entry.originalText.replace(/\s+/gu, " ")}</span>}
            {entry.revisedText && <span className="mt-1 block truncate text-xs leading-5 text-emerald-900">Later: {entry.revisedText.replace(/\s+/gu, " ")}</span>}
          </button>;
        })}</div>
      </details>)}
    </section>}
    <div className="grid min-w-0 gap-3 xl:grid-cols-2">
      <section aria-label="Earlier version" className="min-w-0 border border-slate-200 bg-white"><h2 className="border-b border-slate-200 px-3 py-2 text-xs font-semibold text-[#003366]">Earlier version · {earlierName}</h2><pre className="max-h-[72vh] min-h-56 overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-6 text-slate-800">{earlierText}</pre></section>
      <section aria-label="Later version" className="min-w-0 border border-slate-200 bg-white"><h2 className="border-b border-slate-200 px-3 py-2 text-xs font-semibold text-[#003366]">Later version · {laterName}</h2><pre className="max-h-[72vh] min-h-56 overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-6 text-slate-800">{laterText}</pre></section>
    </div>
    {selected && changedParts && <article aria-label="Selected change" className="border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-[#31577D]">{selected.section} · {selected.summary}</p>{changedParts.left.length > 0 && <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-rose-900" aria-label="Earlier wording">{changedParts.left.map((part, partIndex) => part.changed ? <del key={partIndex}>{part.text}</del> : <span key={partIndex}>{part.text}</span>)}</p>}{changedParts.right.length > 0 && <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-emerald-900" aria-label="Later wording">{changedParts.right.map((part, partIndex) => part.changed ? <ins key={partIndex}>{part.text}</ins> : <span key={partIndex}>{part.text}</span>)}</p>}</article>}
    <p className="text-[10px] text-slate-500">{caveat || "Text is compared in this browser. Confirm each change against the source documents."}</p>
  </section>;
}
