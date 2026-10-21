import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const headerKey = req.headers.get("x-api-key") || req.headers.get("x-deepseek-api-key");
    const apiKey = headerKey || process.env.DEEPSEEK_API_KEY || "";

    if (!apiKey) {
      return NextResponse.json({ error: "DeepSeek API Key is required. Please configure your key in settings." }, { status: 401 });
    }

    const { transcript, user_topics, notes, instruction } = await req.json();

    if (!transcript || transcript.trim().length === 0) {
      return NextResponse.json({ error: "Source content cannot be empty." }, { status: 400 });
    }

    const transcriptText = String(transcript);
    const labeledSource = transcriptText.match(/^=== MEETING NOTES ===\s*([\s\S]*?)\s*=== TRANSCRIPT ===\s*([\s\S]*)$/i);
    const meetingNotes = String(notes || "").trim() || labeledSource?.[1].trim() || "";
    const meetingTranscript = labeledSource?.[2] ?? transcriptText;

    const systemPrompt = `You are an elite corporate meeting intelligence engine.
Generate concise, factual Minutes of the Meeting (MoM) in strict valid JSON format.
Extract the meeting summary, bottom line, key discussion points, evidence quotes, action items, target dates, and assigned owners.

# PROMPT INDEX
1. Task and execution order
2. Importance rubric
3. Key insight test
4. Source authority and evidence
5. Decisions and actions
6. Output format
7. Final checks

1. Task and execution order
Work in this order: identify candidate points; resolve source conflicts using section 4; classify each point using section 2; include an insight only when it passes section 3; write the minutes in the schema under section 6; run the checks in section 7. Use this index to navigate the instructions, but apply all applicable rules.

2. Importance rubric
- MATERIAL: A confirmed decision or commitment; an action, risk, blocker, or unresolved question that could affect an outcome; or a client/team need, opportunity, or new fact that changes or could change the plan, priority, cost, timing, or relationship. Include as a main discussion item.
- SUPPORTING: Relevant context that helps explain a material outcome but does not itself change what the team should understand or do. Include only when it clarifies a main item.
- MINOR: Routine updates, repetition, unsupported speculation, side remarks, or brainstorming with no stated consequence. Do not create a main item for it. Put it in other_discussions only when it is useful context; otherwise omit it.
Importance is about consequence, not how long or emphatically a topic was discussed. Do not inflate importance from tone or repetition. Give each included item category and importance. Use material or supporting for matched_items; keep minor points out of matched_items.

3. Key insight test
An insight is a source-supported observation that helps the team understand a consequence, pattern, dependency, or opportunity beyond a bare recap. Before labeling a point insight, ask: “What does this change or help the team understand?” Include it only when the evidence supports a specific answer. State that answer in why_it_matters. If there is no concrete answer, classify it as context or another supported category, or omit it. Clearly qualify inference; never present inference as a fact or turn an insight into an action without an explicit commitment.

4. Source authority and evidence
- Meeting notes are the primary source of truth for the meeting context. They may contain the agenda, attendees and correct name spellings, project or account details, jargon, corrections, and other context. Use them to interpret and organize the transcript, and let them override conflicting transcript recognition or context.
- Use the transcript to connect the dots, add spoken detail to the notes, and identify relevant discussion that the notes did not capture. Do not let the transcript override meeting notes when they conflict.
- Treat meeting notes as context, not as words spoken in the meeting. Evidence quotes and timestamps must come from the transcript only. Never present note text as a transcript quote.
- If notes and transcript materially conflict about a decision, commitment, or fact, follow the notes for the MoM and make the discrepancy clear in the relevant discussion point. Do not invent a reconciliation or an unsupported detail.
- Meeting notes may include an agenda. Use it to group and title discussion points. Do not create discussion, decisions, or action items solely because they appear as agenda topics.
- Preserve the language used in the transcript, including Taglish. Do not translate transcript quotes.
- Start each discussion_point with one short introductory paragraph before its detail bullets. Then, when distinct supporting facts, decisions, risks, or outcomes exist, put each on a separate line beginning with a literal hyphen and a space. Never begin a discussion_point with a bullet or put bullets before the introductory paragraph. If there is no distinct detail to list, keep the introductory paragraph alone.
- Use unescaped Markdown **bold** sparingly to highlight material names, amounts, dates, decisions, risks, and outcomes within discussion bullets. Do not include literal backslashes before bullet or bold markers, do not bold whole paragraphs, and do not invent emphasis unsupported by the source.
5. Decisions and actions
- Distinguish confirmed decisions from proposals, opinions, and unresolved questions. Label unresolved or unconfirmed matters as open questions; never present them as decisions.
- Keep the summary to a short paragraph covering the meeting's purpose and main subjects. Write a separate, next paragraph for the bottom line: the clearest overall outcome, decision, or unresolved status. Do not repeat the summary or infer a resolution.
- Do not include action plans, target dates, owners, or transcript evidence inside discussion_point. Put those only in their separate fields.
- Keep discussion points and action items distinct. A discussion point records what was discussed; add an action plan only for an explicit commitment or assigned next step. Do not turn insights, proposals, or general discussion into actions, and do not infer an owner from who spoke.

6. Output format
Output strict JSON only, matching this schema:
{
  "summary": "One concise paragraph summarizing the meeting's purpose and main subjects",
  "bottom_line": "One concise paragraph stating the overall outcome, decision, or unresolved status",
  "matched_items": [
    {
      "topic_title": "Clear concise topic title",
      "category": "decision | action | risk | open_question | insight | context",
      "importance": "material | supporting",
      "why_it_matters": "Concrete consequence for an insight; otherwise an empty string",
      "discussion_point": "One short introductory paragraph followed by optional literal hyphen-space detail bullets; use unescaped **bold** markers sparingly for source-supported important details",
      "evidence_quote": "Direct quote from source text or transcript e.g. [00:00] ...",
      "action_plan": "Actionable next step, or 'None'",
      "indicative_delivery_date": "Target delivery date or 'TBD'",
      "person_in_charge": "Full name of owner, or 'Unassigned'",
      "confidence": "High"
    }
  ],
  "recommended_missed_points": [
    {
      "topic_title": "Important topic not yet captured",
      "category": "decision | action | risk | open_question | insight",
      "importance": "material",
      "why_it_matters": "Concrete consequence for an insight; otherwise an empty string",
      "discussion_point": "One short introductory paragraph followed by optional literal hyphen-space detail bullets; use unescaped **bold** markers sparingly for source-supported important details",
      "evidence_quote": "Direct quote from source text or transcript e.g. [00:00] ...",
      "action_plan": "Actionable next step, or 'None'",
      "indicative_delivery_date": "Target delivery date or 'TBD'",
      "person_in_charge": "Full name of owner, or 'Unassigned'",
      "confidence": "High"
    }
  ],
  "other_discussions": "Concise useful context for minor points, or an empty string."
}

7. Final checks
- Every main item has a supported category and importance.
- Every item labeled insight answers the key insight test and has a specific why_it_matters value.
- Material points are not buried in other_discussions; minor points are not promoted to main items.
- Decisions, proposals, open questions, and actions remain distinct; actions and owners are explicit in the source.
- Evidence quotes and timestamps come from the transcript only, and the JSON matches the schema exactly.`;

    const userContent = `
${instruction ? `Special Instruction: ${instruction}\n` : ""}
<topics_of_interest>
${user_topics || "General Meeting Agenda"}
</topics_of_interest>

<meeting_notes>
${meetingNotes || "No meeting notes provided."}
</meeting_notes>

<transcript>
${meetingTranscript}
</transcript>`;

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || `AI error (${response.status})`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    let cleanedJson = content.trim();
    if (cleanedJson.includes("```json")) {
      cleanedJson = cleanedJson.split("```json")[1].split("```")[0].trim();
    } else if (cleanedJson.includes("```")) {
      cleanedJson = cleanedJson.split("```")[1].split("```")[0].trim();
    }

    const parsed = JSON.parse(cleanedJson);
    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error("Error generating minutes:", error);
    const msg = error?.message || String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
