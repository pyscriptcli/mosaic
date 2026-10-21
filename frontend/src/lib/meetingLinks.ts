export type MeetingPlatform = "google_meet" | "zoom" | "teams";

export function parseMeetingLink(value: string): { meetingLink: string; platform: MeetingPlatform } | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "meet.google.com" && /^\/[^/]+/.test(url.pathname)) {
      return { meetingLink: url.toString(), platform: "google_meet" };
    }
    if ((host === "zoom.us" || host.endsWith(".zoom.us")) && /\/j\//i.test(url.pathname)) {
      return { meetingLink: url.toString(), platform: "zoom" };
    }
    if ((host === "teams.microsoft.com" || host === "teams.live.com" || host.endsWith(".teams.microsoft.com")) && /\/l\/meetup-join\//i.test(url.pathname)) {
      return { meetingLink: url.toString(), platform: "teams" };
    }
  } catch {
    return null;
  }
  return null;
}
