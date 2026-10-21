// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeetingSummaryEditor } from "./MeetingWorkspaceContent";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MeetingSummaryEditor", () => {
  it("refines the summary using meeting notes and transcript, then keeps fields editable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ summary: "Refined summary", bottom_line: "Agreed to proceed." }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const onChange = vi.fn();
    render(
      <MeetingSummaryEditor
        summary="Original summary"
        bottomLine="Original bottom line"
        onChange={onChange}
        notes="Agenda: renewal review"
        transcript="The team agreed to proceed."
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Refine with AI" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("Refined summary", "Agreed to proceed."));
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.notes).toBe("Agenda: renewal review");
    expect(requestBody.transcript).toBe("The team agreed to proceed.");
    expect(screen.getByLabelText("Summary")).toBeTruthy();
    expect(screen.getByLabelText("Bottom line")).toBeTruthy();
  });
});
