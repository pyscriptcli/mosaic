"use client";

import React, { useEffect, useState } from "react";
import { 
  X, 
  Search, 
  Sparkles, 
  Zap, 
  Plus, 
  Loader2,
} from "lucide-react";
import type { DiscoveredTopicItem } from "@/app/api/discover-topics/route";

function renderDiscussionText(text: string) {
  return <div className="space-y-1">{text.split(/\r?\n/).filter(Boolean).map((line, lineIndex) => {
    const bullet = line.trim().match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    const value = bullet?.[1] || line.trim();
    const parts = value.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, partIndex) => part.startsWith("**") && part.endsWith("**") ? <strong key={partIndex} className="font-bold text-[#003366]">{part.slice(2, -2)}</strong> : <React.Fragment key={partIndex}>{part}</React.Fragment>);
    return bullet ? <p key={lineIndex} className="pl-3 before:mr-2 before:text-[#C9AB4C] before:content-['•']">{parts}</p> : <p key={lineIndex}>{parts}</p>;
  })}</div>;
}

interface DiscoverTopicsModalProps {
  isOpen: boolean;
  onClose: () => void;
  missedTopics: DiscoveredTopicItem[];
  isDiscoveringTopics: boolean;
  autoDiscoverEnabled: boolean;
  onToggleAutoDiscover: () => void;
  topicQuery: string;
  onTopicQueryChange: (query: string) => void;
  onDiscoverTopics: (query?: string) => void;
  onAddTopic: (index: number) => void;
  onAddAction?: (index: number) => void;
  onAddAllActions?: () => void;
  onAddAllTopics: () => void;
  onDismissTopic: (index: number) => void;
  transcript: string;
}

export function DiscoverTopicsModal({
  isOpen,
  onClose,
  missedTopics,
  isDiscoveringTopics,
  autoDiscoverEnabled,
  onToggleAutoDiscover,
  topicQuery,
  onTopicQueryChange,
  onDiscoverTopics,
  onAddTopic,
  onAddAction,
  onAddAllActions,
  onAddAllTopics,
  onDismissTopic,
  transcript,
}: DiscoverTopicsModalProps) {
  const [activeTab, setActiveTab] = useState<"topics" | "actions">("topics");
  const topicRows = missedTopics.map((topic, index) => ({ topic, index }));
  const actionRows = missedTopics
    .map((topic, index) => ({ topic, index }))
    .filter(({ topic }) => Boolean(topic.action_plan && topic.action_plan !== "None"));
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="discover-topics-title"
    >
      <div 
        className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#FFFCFB] border border-[#003366]/40 shadow-2xl rounded-none overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-5 py-3.5 bg-[#003366] text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 bg-[#c9ab4c]"></div>
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-[#c9ab4c]" />
              <h2 id="discover-topics-title" className="text-xs font-bold uppercase tracking-[0.2em]">
                Discover & Search Discussion Points
              </h2>
            </div>
            <span className="text-[11px] text-gray-300 font-semibold tracking-wider">
              {isDiscoveringTopics ? (
                <span className="text-[#c9ab4c] font-bold inline-flex items-center gap-1.5 ml-2">
                  <Loader2 size={12} className="animate-spin" /> Scanning transcript...
                </span>
              ) : (
                <span className="ml-1 text-gray-300">
                  ({missedTopics.length} {missedTopics.length === 1 ? "discussion point" : "discussion points"} suggested)
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Auto-Discover Toggle */}
            <button
              type="button"
              onClick={onToggleAutoDiscover}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-colors border ${
                autoDiscoverEnabled
                  ? "bg-white/10 text-white border-white/30 font-semibold"
                  : "bg-white/5 text-gray-400 border-white/10"
              }`}
              title={autoDiscoverEnabled ? "Auto-discover is active for new transcripts" : "Auto-discover is paused"}
            >
              <Zap size={11} className={autoDiscoverEnabled ? "text-[#c9ab4c] fill-[#c9ab4c]" : "text-gray-400"} />
              <span>Auto-Discover: <strong>{autoDiscoverEnabled ? "ON" : "OFF"}</strong></span>
            </button>

            {/* Add All Button */}
            {activeTab === "topics" && missedTopics.length > 1 && (
              <button
                type="button"
                onClick={onAddAllTopics}
                className="bg-[#c9ab4c] text-[#003366] hover:bg-[#d8bc5e] px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-none shadow-2xs inline-flex items-center gap-1 transition-colors"
              >
                <Plus size={12} /> Add All ({missedTopics.length}) Discussion Points
              </button>
            )}
            {activeTab === "actions" && actionRows.length > 1 && (
              <button type="button" onClick={onAddAllActions} className="bg-[#c9ab4c] px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#003366] hover:bg-[#d8bc5e]">
                <Plus size={12} className="mr-1 inline" /> Add All ({actionRows.length}) Action Items
              </button>
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-gray-300 hover:text-white hover:bg-white/10 transition-colors ml-1"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Search & Action Input Bar */}
        <div className="p-4 border-b border-gray-200 bg-[#FFFCFB] shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!isDiscoveringTopics && transcript) {
                onDiscoverTopics(topicQuery);
              }
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={topicQuery}
                onChange={(e) => onTopicQueryChange(e.target.value)}
                placeholder="Find a discussion point in the transcript (e.g., 'reclamation', 'service agreement')..."
                className="w-full pl-9 pr-8 py-2 text-xs bg-[#FFFCFB] border border-gray-200 focus:outline-none focus:border-[#003366] transition-colors rounded-none placeholder:text-gray-400"
              />
              {topicQuery && (
                <button
                  type="button"
                  onClick={() => onTopicQueryChange("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="submit"
                disabled={isDiscoveringTopics || !transcript}
                className="btn-primary !py-2 !px-4 !text-xs rounded-none inline-flex items-center justify-center gap-1.5"
              >
                {isDiscoveringTopics ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                {topicQuery.trim() ? "Search Topic" : "Discover Topics"}
              </button>
              <button
                type="button"
                onClick={() => onDiscoverTopics("")}
                disabled={isDiscoveringTopics || !transcript}
                className="btn-outline !py-2 !px-3.5 !text-xs rounded-none inline-flex items-center justify-center gap-1.5 text-gray-700 hover:text-[#003366]"
                title="Scan transcript for important discussion points not already captured"
              >
                <Sparkles size={13} className="text-[#c9ab4c]" />
                Auto-Discover
              </button>
            </div>
          </form>
        </div>

        <div role="tablist" aria-label="Discovered meeting items" className="flex border-b border-gray-200 bg-white px-4">
          <button type="button" role="tab" aria-selected={activeTab === "topics"} onClick={() => setActiveTab("topics")} className={`border-b-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider ${activeTab === "topics" ? "border-[#003366] text-[#003366]" : "border-transparent text-gray-400"}`}>
            Topics ({topicRows.length})
          </button>
          <button type="button" role="tab" aria-selected={activeTab === "actions"} onClick={() => setActiveTab("actions")} className={`border-b-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider ${activeTab === "actions" ? "border-[#003366] text-[#003366]" : "border-transparent text-gray-400"}`}>
            Action Items ({actionRows.length})
          </button>
        </div>

        {/* Scrollable Topics and Actions */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 min-h-[220px]">
          {(activeTab === "topics" ? topicRows.length === 0 : actionRows.length === 0) ? (
            <div className="text-center py-12 px-4 bg-[#FFFCFB] border border-dashed border-gray-200">
              <Sparkles size={28} className="mx-auto text-[#c9ab4c] mb-2.5 opacity-80" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#003366]">{activeTab === "topics" ? "No Uncaptured Discussion Points" : "No Explicit Action Items Found"}</h3>
              <p className="text-[11px] text-gray-500 mt-1.5 max-w-md mx-auto leading-relaxed">
                {activeTab === "topics" ? <>Find discussion points that are missing from the minutes. Search a keyword above or run <strong>Auto-Discover</strong>.</> : <>An action item appears here only when the transcript contains an explicit commitment or assigned next step. Discover more topics to check again.</>}
              </p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => onDiscoverTopics("")}
                  disabled={isDiscoveringTopics || !transcript}
                  className="btn-primary !py-1.5 !px-3.5 !text-xs rounded-none inline-flex items-center gap-1.5"
                >
                  <Sparkles size={12} /> Run Topic Discovery Now
                </button>
              </div>
            </div>
          ) : activeTab === "topics" ? (
            <>
              <p className="text-[11px] text-gray-500">Discussion points capture what was discussed. Add an item here to the Discussion Points tab.</p>
              {topicRows.map(({ topic, index: idx }) => (
              <div
                key={idx}
                className="p-4 bg-white border border-gray-200 shadow-2xs hover:border-[#003366]/40 transition-all rounded-none"
              >
                {/* Topic Title & Actions Header */}
                <div className="flex items-start justify-between gap-3 pb-2.5 border-b border-gray-100">
                  <div className="flex items-center gap-2.5 flex-wrap flex-1">
                    <span className="font-[family-name:--font-bebas] text-xl text-[#c9ab4c] tracking-wider select-none shrink-0">
                      #{String(idx + 1).padStart(2, "0")}
                    </span>
                    <h4 className="text-sm font-bold text-[#003366] font-serif">
                      {topic.topic_title}
                    </h4>
                    {topic.confidence && (
                      <span className={`text-[9px] font-bold px-2 py-0.5 uppercase tracking-wider ${
                        topic.confidence === "High" 
                          ? "bg-[#c9ab4c]/15 text-[#8c7329]" 
                          : "bg-blue-50 text-blue-700"
                      }`}>
                        {topic.confidence} Confidence
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onAddTopic(idx)}
                      className="btn-outline !py-1.5 !px-3 !text-xs rounded-none shadow-2xs inline-flex items-center gap-1.5 text-[#003366] hover:bg-[#003366] hover:text-white"
                      title="Add this discussion point to the Discussion Points tab"
                    >
                      <Plus size={12} /> Add Discussion Point
                    </button>
                    <button
                      type="button"
                      onClick={() => onDismissTopic(idx)}
                      className="p-1 text-gray-400 hover:text-red-500 hover:bg-gray-100 transition-colors"
                      title="Dismiss suggestion"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>

                {/* Evidence Quote */}
                {topic.evidence_quote && (
                  <div className="mt-3 pl-3 border-l-2 border-[#c9ab4c]/70 py-0.5 bg-gray-50/50">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#c9ab4c] block mb-0.5">
                      Evidence Quote / Context Reference
                    </span>
                    <p className="text-[11px] text-gray-600 italic">
                      &ldquo;{topic.evidence_quote}&rdquo;
                    </p>
                  </div>
                )}

                {/* Discussion Point Summary */}
                {topic.discussion_point && (
                  <div className="mt-2.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-0.5">
                      Discussion Point
                    </span>
                    <div className="text-xs leading-relaxed text-gray-700">{renderDiscussionText(topic.discussion_point)}</div>
                  </div>
                )}
              </div>
              ))}
            </>
          ) : (
            <>
              <p className="text-[11px] text-gray-500">Only explicit commitments appear here. Adding one creates a separate action item linked to its discussion point.</p>
              {actionRows.map(({ topic, index }) => (
                <article key={`${index}-${topic.topic_title}`} className="border border-gray-200 bg-white p-4 shadow-2xs">
                  <header className="flex items-start justify-between gap-3 border-b border-gray-100 pb-2.5">
                    <div><h3 className="font-serif text-sm font-bold text-[#003366]">{topic.topic_title}</h3><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Discussion point</p><div className="mt-1 text-xs leading-relaxed text-slate-700">{renderDiscussionText(topic.discussion_point)}</div></div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button type="button" onClick={() => onAddAction?.(index)} className="btn-outline !py-1.5 !px-3 !text-xs rounded-none inline-flex items-center gap-1.5 text-[#003366]"><Plus size={12} /> Add Action Item</button>
                      <button type="button" onClick={() => onDismissTopic(index)} aria-label={`Dismiss ${topic.topic_title}`} className="p-1 text-gray-400 hover:text-red-500"><X size={15} /></button>
                    </div>
                  </header>
                  {topic.evidence_quote && <p className="mt-3 border-l-2 border-[#c9ab4c] bg-gray-50 px-3 py-2 text-[11px] italic leading-relaxed text-slate-600">{topic.evidence_quote}</p>}
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Action Plan</span><p className="mt-1 text-sm leading-relaxed text-[#003366]">{topic.action_plan}</p></div>
                    <div><span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Target Date</span><p className="mt-1 text-xs text-slate-700">{topic.indicative_delivery_date === "TBD" ? "Not specified" : topic.indicative_delivery_date}</p><span className="mt-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Person in Charge</span><p className="mt-1 text-xs text-slate-700">{topic.person_in_charge === "Unassigned" ? "Unassigned" : topic.person_in_charge}</p></div>
                  </div>
                </article>
              ))}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-gray-500">
            {activeTab === "topics" ? "Adding creates a discussion point only. Add its action separately from the Action Items tab." : "Adding an action links it to its discussion point; a missing discussion point is added at the same time."}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="btn-outline !py-1.5 !px-4 !text-xs rounded-none"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
