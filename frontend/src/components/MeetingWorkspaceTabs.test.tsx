// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MeetingWorkspaceTabs } from "./MeetingWorkspaceTabs";

describe("MeetingWorkspaceTabs", () => {
  it("shows summary first, then the meeting work tabs, and changes the active tab", () => {
    const onChange = vi.fn();
    render(<MeetingWorkspaceTabs value="discussion" onChange={onChange} />);

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Summary",
      "Discussion Points",
      "Action Items",
      "Meeting Notes",
      "Transcript",
    ]);
    fireEvent.click(tabs[2]);
    expect(onChange).toHaveBeenCalledWith("actions");
  });
});
