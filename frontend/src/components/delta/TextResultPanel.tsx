import { useState } from "react";
import type { DeltaEntry } from "@/lib/delta/compare";

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
  const control = "min-h-9 border border-slate-300 bg-white px-3 text-xs font-semibold text-[#003366] disabled:opacity-40";
  return <section aria-label="Text comparison" className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-white p-3">
      <span role="status" aria-live="polite" className="text-xs font-semibold text-[#003366]">{entries.length ? `Change ${index + 1} of ${entries.length}` : caveat ? "No comparable text changes" : "No differences found"}</span>
      <div className="flex gap-2"><button type="button" className={control} disabled={!entries.length || index === 0} onClick={() => setIndex((current) => Math.max(0, current - 1))}>Previous change</button><button type="button" className={control} disabled={!entries.length || index >= entries.length - 1} onClick={() => setIndex((current) => Math.min(entries.length - 1, current + 1))}>Next change</button></div>
    </div>
    <div className="grid min-w-0 gap-3 xl:grid-cols-2">
      <section aria-label="Earlier version" className="min-w-0 border border-slate-200 bg-white"><h2 className="border-b border-slate-200 px-3 py-2 text-xs font-semibold text-[#003366]">Earlier version · {earlierName}</h2><pre className="max-h-[72vh] min-h-56 overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-6 text-slate-800">{earlierText}</pre></section>
      <section aria-label="Later version" className="min-w-0 border border-slate-200 bg-white"><h2 className="border-b border-slate-200 px-3 py-2 text-xs font-semibold text-[#003366]">Later version · {laterName}</h2><pre className="max-h-[72vh] min-h-56 overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-6 text-slate-800">{laterText}</pre></section>
    </div>
    {selected && changedParts && <article aria-label="Selected change" className="border border-slate-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-[#31577D]">{selected.section} · {selected.summary}</p>{changedParts.left.length > 0 && <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-rose-900" aria-label="Earlier wording">{changedParts.left.map((part, partIndex) => part.changed ? <del key={partIndex}>{part.text}</del> : <span key={partIndex}>{part.text}</span>)}</p>}{changedParts.right.length > 0 && <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-emerald-900" aria-label="Later wording">{changedParts.right.map((part, partIndex) => part.changed ? <ins key={partIndex}>{part.text}</ins> : <span key={partIndex}>{part.text}</span>)}</p>}</article>}
    <p className="text-[10px] text-slate-500">{caveat || "Text is compared in this browser. Confirm each change against the source documents."}</p>
  </section>;
}
