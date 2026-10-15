import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest, getUserFromRequest } from "@/lib/auth";
import { AdminConfigError, isAskEchoEnabled } from "@/lib/admin-config/store";
import { answerGoogleAdsQuestion } from "@/lib/ask-echo/service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const token = getTokenFromRequest(req);
  const user = getUserFromRequest(req);
  if (!token || !user?.email) return NextResponse.json({ error: "Please sign in before asking Echo." }, { status: 401 });
  try {
    if (!(await isAskEchoEnabled())) {
      return NextResponse.json({ error: "Ask Echo is currently disabled by an administrator.", code: "FEATURE_DISABLED" }, { status: 403 });
    }
    const body = await req.json();
    return NextResponse.json(await answerGoogleAdsQuestion(body, {
      id: user.id,
      name: user.username,
      email: user.email.toLowerCase().trim(),
    }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = Number((error as { status?: number }).status || 500);
    if (error instanceof AdminConfigError || (error && typeof error === "object" && (error as { name?: string }).name === "AdminConfigError")) {
      return NextResponse.json({ error: (error as Error).message, code: "CONFIG_UNAVAILABLE" }, { status: (error as AdminConfigError).status || 503 });
    }
    const message = status >= 500 ? "Echo could not answer right now. Please try again." : error instanceof Error ? error.message : "The question could not be processed.";
    if (status >= 500) console.error("[Google Ads Echo] Request failed:", error);
    return NextResponse.json({ error: message }, { status });
  }
}
