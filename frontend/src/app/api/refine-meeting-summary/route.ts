import { NextRequest, NextResponse } from "next/server";

const refinementGuidance = {
  balanced: "Improve clarity and flow while preserving the draft's level of detail.",
  concise: "Prefer short sentences and retain only material context; do not omit decisions, dates, owners, risks, or unresolved questions.",
  "decision-focused": "Emphasize confirmed decisions, outcomes, commitments, and unresolved decisions without turning them into new facts or actions.",
  "detail-preserving": "Retain meaningful account and project details, examples, numbers, and dependencies; remove repetition only.",
} as const;

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get("x-api-key") || process.env.DEEPSEEK_API_KEY || "";
    if (!apiKey) {
      return NextResponse.json({ error: "DeepSeek API key is required. Configure it in settings to refine the summary." }, { status: 401 });
    }

    const { summary = "", bottom_line = "", notes = "", transcript = "", refinement_style = "balanced" } = await request.json();
    const selectedGuidance = refinementGuidance[refinement_style as keyof typeof refinementGuidance] || refinementGuidance.balanced;
    const meetingNotes = String(notes).trim();
    const meetingTranscript = String(transcript).trim();
    if (!meetingNotes && !meetingTranscript) {
      return NextResponse.json({ error: "Add meeting notes or a transcript before refining the summary." }, { status: 400 });
    }

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: `Refine a meeting summary and bottom line. Return valid JSON only with string keys "summary" and "bottom_line". Keep the summary to one concise paragraph describing the purpose and main subjects. Keep the bottom line to one concise paragraph describing the outcome, decision, or unresolved status. Meeting notes are the primary source of truth and may contain corrections, agenda, names, projects, or context. Use the transcript to connect details and add clearly supported spoken information. Do not let the transcript override meeting notes. Preserve Taglish and names as provided. Do not invent facts, decisions, owners, or commitments. Use the existing draft as an editable starting point, removing repetition and improving clarity while preserving supported content. If a source conflict cannot be resolved from the notes, state the uncertainty clearly. Selected refinement style: ${selectedGuidance}`,
          },
          {
            role: "user",
            content: JSON.stringify({
              current_summary: String(summary),
              current_bottom_line: String(bottom_line),
              meeting_notes: meetingNotes || "No meeting notes provided.",
              transcript: meetingTranscript || "No transcript provided.",
            }),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      throw new Error(details.error?.message || `AI request failed (${response.status}).`);
    }

    const data = await response.json();
    const content = String(data.choices?.[0]?.message?.content || "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    const parsed = JSON.parse(content);
    return NextResponse.json({ summary: String(parsed.summary || ""), bottom_line: String(parsed.bottom_line || "") });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
