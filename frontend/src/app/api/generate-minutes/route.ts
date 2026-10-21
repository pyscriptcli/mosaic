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
Generate highly professional, structured Minutes of the Meeting (MoM) in strict valid JSON format.
Extract all key discussion points, evidence quotes, action items, target delivery dates, and responsible owners.

Source authority and use:
- Meeting notes are the primary source of truth for the meeting context. They may contain the agenda, attendees and correct name spellings, project or account details, jargon, corrections, and other context. Use them to interpret and organize the transcript, and let them override conflicting transcript recognition or context.
- Use the transcript to connect the dots, add spoken detail to the notes, and identify relevant discussion that the notes did not capture. Do not let the transcript override meeting notes when they conflict.
- Treat meeting notes as context, not as words spoken in the meeting. Evidence quotes and timestamps must come from the transcript only. Never present note text as a transcript quote.
- If notes and transcript materially conflict about a decision, commitment, or fact, follow the notes for the MoM and make the discrepancy clear in the relevant discussion point. Do not invent a reconciliation or an unsupported detail.
- Meeting notes may include an agenda. Use it to group and title discussion points. Do not create discussion, decisions, or action items solely because they appear as agenda topics.
- Preserve the language used in the transcript, including Taglish. Do not translate transcript quotes.
- Keep each discussion point concise: begin with a short paragraph, then use bullets for distinct details, decisions, or outcomes when useful.
- Do not include action plans, target dates, owners, or transcript evidence inside discussion_point. Put those only in their separate fields.
- Keep discussion points and action items distinct. A discussion point records what was discussed; add an action plan only for an explicit commitment or assigned next step. Do not turn insights, proposals, or general discussion into actions, and do not infer an owner from who spoke.

Output strict JSON only, matching this schema:
{
  "matched_items": [
    {
      "topic_title": "Clear concise topic title",
      "discussion_point": "Short paragraph followed by bullets for distinct details, decisions, or outcomes when useful",
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
      "discussion_point": "Short paragraph followed by bullets for distinct details, decisions, or outcomes when useful",
      "evidence_quote": "Direct quote from source text or transcript e.g. [00:00] ...",
      "action_plan": "Actionable next step, or 'None'",
      "indicative_delivery_date": "Target delivery date or 'TBD'",
      "person_in_charge": "Full name of owner, or 'Unassigned'",
      "confidence": "High"
    }
  ],
  "other_discussions": "Comprehensive summary of announcements, non-action items, peripheral topics, and general context."
}`;

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
