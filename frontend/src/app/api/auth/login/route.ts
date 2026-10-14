import { NextRequest, NextResponse } from "next/server";
import { getLocalDevelopmentClickUpPersonalToken, getOAuthCredentials, isAllowedClickUpSignIn, setAuthCookies, type ClickUpUserProfile } from "@/lib/auth";
import { clickUpFetch as fetch } from "@/lib/clickupCalendarApi";

async function loginWithLocalPersonalToken(req: NextRequest, token: string) {
  const profileResponse = await fetch("https://api.clickup.com/api/v2/user", {
    headers: { Authorization: token },
    cache: "no-store",
  }).catch(() => null);

  if (!profileResponse?.ok) {
    return NextResponse.redirect(new URL("/?auth_error=personal_api_token_invalid", req.url));
  }

  const payload = await profileResponse.json().catch(() => null) as { user?: Record<string, unknown> } | null;
  const apiUser = payload?.user;
  const email = typeof apiUser?.email === "string" ? apiUser.email : "";
  const id = apiUser?.id;
  if (!apiUser || (typeof id !== "string" && typeof id !== "number") || !email) {
    return NextResponse.redirect(new URL("/?auth_error=company_email_required", req.url));
  }
  if (!await isAllowedClickUpSignIn(email)) {
    return NextResponse.redirect(new URL("/?auth_error=company_email_required", req.url));
  }

  let workspaceName = "Primephilippines";
  const teamResponse = await fetch("https://api.clickup.com/api/v2/team", {
    headers: { Authorization: token },
    cache: "no-store",
  }).catch(() => null);
  if (teamResponse?.ok) {
    const teamPayload = await teamResponse.json().catch(() => null) as { teams?: Array<{ name?: string }> } | null;
    workspaceName = teamPayload?.teams?.[0]?.name || workspaceName;
  }

  const username = typeof apiUser.username === "string" ? apiUser.username : email;
  const user: ClickUpUserProfile = {
    id,
    username,
    email,
    color: typeof apiUser.color === "string" ? apiUser.color : "#C9AB4C",
    profilePicture: typeof apiUser.profilePicture === "string" ? apiUser.profilePicture : null,
    initials: typeof apiUser.initials === "string"
      ? apiUser.initials
      : username.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
    workspaceName,
  };
  const response = NextResponse.redirect(new URL("/", req.url));
  setAuthCookies(response, token, user);
  return response;
}

function isLoopbackRequest(req: NextRequest) {
  const hostname = new URL(req.url).hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export async function GET(req: NextRequest) {
  const { clientId, clientSecret, redirectUri: configuredUri } = getOAuthCredentials();
  const url = new URL(req.url);
  const redirectUri = configuredUri || `${url.origin}/api/auth/callback`;

  // Echo uses a separate OAuth connection for every signed-in user. A shared
  // workspace token must never be used as a fallback because it can bypass
  // the user's ClickUp permissions.
  if (clientId && clientSecret) {
    const clickUpAuthUrl = new URL("https://app.clickup.com/api");
    clickUpAuthUrl.searchParams.set("client_id", clientId);
    clickUpAuthUrl.searchParams.set("redirect_uri", redirectUri);
    return NextResponse.redirect(clickUpAuthUrl.toString());
  }

  // A personal API key may be used only by the local development server.
  // Production and preview deployments always require per-user OAuth.
  const localPersonalToken = getLocalDevelopmentClickUpPersonalToken();
  if (localPersonalToken && isLoopbackRequest(req)) return loginWithLocalPersonalToken(req, localPersonalToken);

  // OAuth is intentionally required; do not silently sign everybody in with
  // an administrator/workspace token.
  const detectedClickUpKeys = Object.keys(process.env)
    .filter((k) => k.toUpperCase().includes("CLICKUP"))
    .join(",");

  return NextResponse.redirect(
    new URL(
      `/?auth_error=missing_credentials&detected=${encodeURIComponent(detectedClickUpKeys)}`,
      req.url
    )
  );
}
