// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeetingSummaryEditor } from "./MeetingWorkspaceContent";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MeetingSummaryEditor", () => {
  it("lets the user choose a refinement style and sends it with the summary request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ summary: "Concise summary", bottom_line: "Decision pending." }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(
      <MeetingSummaryEditor
        summary="Original summary"
        bottomLine="Original bottom line"
        onChange={vi.fn()}
        notes="Agenda: renewal review"
        transcript="The team discussed renewal timing."
      />,
    );

    fireEvent.change(screen.getByLabelText("Refinement style"), { target: { value: "concise" } });
    fireEvent.click(screen.getByRole("button", { name: "Refine with AI" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.refinement_style).toBe("concise");
  });

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
