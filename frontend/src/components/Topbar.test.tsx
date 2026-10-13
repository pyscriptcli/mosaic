// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Topbar } from "./Topbar";

const baseProps = {
  meetings: [],
  onOpenUniversalEcho: vi.fn(),
  onSelectMeeting: vi.fn(),
  onOpenStudio: vi.fn(),
  onGoToNotetaker: vi.fn(),
};

describe("Topbar meeting control", () => {
  it("replaces New Meeting with the active meeting clock and opens the session", () => {
    const onRestore = vi.fn();
    render(<Topbar {...baseProps} studioRecording={{ active: true, isMinimized: false, elapsedSeconds: 3723, onRestore }} />);

    expect(screen.queryByText("New Meeting")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /recording 01:02:03/i }));
    expect(onRestore).toHaveBeenCalledOnce();
  });
});
