// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioPanel } from "./StudioPanel";
import type { UseStudioRecorderReturn } from "@/hooks/useStudioRecorder";

const recorder = {
  status: "idle",
  elapsedSeconds: 0,
  sessionId: null,
  mediaType: "audio",
  setMediaType: vi.fn(),
  sourceMode: "online_meeting",
  setSourceMode: vi.fn(),
  availableDevices: [],
  selectedDeviceId: null,
  selectDevice: vi.fn(),
  screenInfo: null,
  isSilenceDetected: false,
  localSavedPath: null,
  hasOtherTabRecording: false,
  start: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  reset: vi.fn(),
  dismissCaptureIssue: vi.fn(),
  audioStream: null,
  recordedFile: null,
  error: null,
  captureIssue: null,
} as unknown as UseStudioRecorderReturn;

describe("Notetaker workspace", () => {
  afterEach(cleanup);

  const renderWorkspace = () => render(
    <StudioPanel
      isOpen
      embedded
      recorder={recorder}
      askEchoEnabled
      meetingDetails={<input aria-label="Meeting name" />}
      mode="fullscreen"
      onChangeMode={() => {}}
      onClose={() => {}}
      onSendToNotetaker={() => {}}
    />,
  );

  it("keeps meeting details collapsed until the contributor opens them", () => {
    renderWorkspace();

    const summary = screen.getByText("Meeting details");
    const details = summary.closest("details");
    expect(details?.open).toBe(false);

    fireEvent.click(summary);
    expect(details?.open).toBe(true);
    expect(screen.getByRole("textbox", { name: "Meeting name" })).toBeTruthy();
  });

  it("lets a small-screen user switch panels without losing an unsent note", () => {
    renderWorkspace();

    const panelSwitcher = within(screen.getByRole("group", { name: "Meeting workspace panels" }));
    const notesTab = panelSwitcher.getByRole("button", { name: "Notes" });
    const captureTab = panelSwitcher.getByRole("button", { name: "Capture" });
    const assistantTab = panelSwitcher.getByRole("button", { name: "Ask Echo" });
    const composer = screen.getByPlaceholderText("Write a decision, follow-up, or note…");
    fireEvent.change(composer, { target: { value: "Confirm the revised timeline" } });

    fireEvent.click(captureTab);
    expect(captureTab.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Start Audio Recording" })).toBeTruthy();
    fireEvent.click(assistantTab);
    const assistantComposer = screen.getByPlaceholderText("Ask about your meetings, decisions, or follow-ups…");
    fireEvent.change(assistantComposer, { target: { value: "What did we decide?" } });
    fireEvent.click(notesTab);
    expect(notesTab.getAttribute("aria-pressed")).toBe("true");
    expect(composer).toHaveProperty("value", "Confirm the revised timeline");
    fireEvent.click(assistantTab);
    expect(assistantComposer).toHaveProperty("value", "What did we decide?");
  });
});
