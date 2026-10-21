import { NextRequest, NextResponse } from "next/server";

export interface DiscoveredTopicItem {
  topic_title: string;
  discussion_point: string;
  evidence_quote: string;
  action_plan: string;
  indicative_delivery_date: string;
  person_in_charge: string;
  confidence: "High" | "Medium" | "Low";
}

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key") || process.env.DEEPSEEK_API_KEY || "";
  if (!apiKey) return NextResponse.json({ error: "AI configuration is required." }, { status: 401 });

  try {
    const { transcript, existingTopics, query } = await req.json();
    if (!transcript?.trim()) return NextResponse.json({ topics: [] });

    const isSearchQuery = Boolean(query && query.trim() && query.trim() !== "all important topics");

    const systemPrompt = `You are an elite corporate meeting intelligence engine for Mosaic.
Analyze the transcript to ${isSearchQuery ? `search for and extract specific discussion topics matching the query "${query}"` : "discover critical discussion topics that are missing from the current minutes"}.

For EVERY discovered topic, you MUST extract complete, high-quality, professional details matching the executive Minutes of the Meeting (MoM) discussion matrix:
1. "topic_title": Clear, concise, and professional topic title (e.g. "Signing Sequence Preference (Landlord Signs First)").
2. "discussion_point": In-depth summary of discussions, context, arguments, decisions, or consensus reached. Never return generic placeholders like "Review this topic".
3. "evidence_quote": Direct quotation from the transcript supporting this topic with approximate timestamp if available, e.g. "[00:10:09] ...".
4. "action_plan": Actionable next step, directive, or deliverable. If purely informational, state "None".
5. "indicative_delivery_date": Specific target deadline mentioned (e.g. "October 6, 2026", "EOD Today", "Next week"), or "TBD" if no date was discussed.
6. "person_in_charge": Full name of the responsible owner/speaker assigned (e.g. "Rommel", "Dave", "Melisa"), or "Unassigned" if unassigned.
7. "confidence": "High" | "Medium" | "Low" based on relevance and evidence clarity.

Keep each discussion point concise: begin with a short paragraph, then use bullets for distinct details, decisions, or outcomes when useful.
Do not include action plans, target dates, owners, or transcript evidence inside discussion_point. Put those only in their separate fields.

Output strictly valid JSON matching this schema:
{
  "topics": [
    {
      "topic_title": string,
      "discussion_point": string,
      "evidence_quote": string,
      "action_plan": string,
      "indicative_delivery_date": string,
      "person_in_charge": string,
      "confidence": "High" | "Medium" | "Low"
    }
  ]
}`;

    const userPrompt = `${isSearchQuery ? `Search Query / Focus Area: ${query.trim()}\n` : "Goal: Uncover high-value, uncaptured discussion topics, commitments, decisions, or policy updates from the meeting.\n"}Already Captured Topics: ${(existingTopics || []).join(", ") || "None yet"}\n\nTranscript:\n${transcript}`;

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ]
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Topic discovery failed");

    const parsed = JSON.parse(String(data.choices?.[0]?.message?.content || "{}"));
    const rawList = Array.isArray(parsed.topics) ? parsed.topics : [];

    // Normalize keys for 100% robustness (handling legacy topic/quote keys or missing fields)
    const normalizedTopics: DiscoveredTopicItem[] = rawList.map((item: any) => ({
      topic_title: String(item.topic_title || item.topic || "Discovered Topic").trim(),
      discussion_point: String(item.discussion_point || item.summary || "Detailed discussion recorded in meeting transcript.").trim(),
      evidence_quote: String(item.evidence_quote || item.quote || "").trim(),
      action_plan: String(item.action_plan || item.action || "None").trim(),
      indicative_delivery_date: String(item.indicative_delivery_date || item.target_date || item.date || "TBD").trim(),
      person_in_charge: String(item.person_in_charge || item.pic || item.owner || "Unassigned").trim(),
      confidence: ["High", "Medium", "Low"].includes(item.confidence) ? item.confidence : "High",
    }));

    return NextResponse.json({ topics: normalizedTopics });
  } catch (error: any) {
    console.error("[Topics] discovery failed", error);
    return NextResponse.json({ error: error.message || "Unable to discover more topics right now." }, { status: 502 });
  }
}
