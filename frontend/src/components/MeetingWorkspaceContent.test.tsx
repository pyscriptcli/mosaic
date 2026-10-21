// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MeetingActionItemsTable, MeetingDiscussionCard } from "./MeetingWorkspaceContent";

describe("MeetingDiscussionCard", () => {
  it("presents a short discussion paragraph and its supporting bullets as a card", () => {
    render(
      <MeetingDiscussionCard
        title="Advisor account update"
        discussionPoint={"The team reviewed the account's renewal status.\n- The client requested revised terms.\n- The renewal is due this quarter."}
      />,
    );

    expect(screen.getByRole("heading", { name: "Advisor account update" })).toBeTruthy();
    expect(screen.getByText("The team reviewed the account's renewal status.")).toBeTruthy();
    expect(screen.getByRole("list").textContent).toContain("The client requested revised terms.");
    expect(screen.queryByText(/Evidence|Transcript Timestamp|Action Plan/i)).toBeNull();
  });

  it("keeps topic and discussion text editable inside the card", () => {
    const onTitleChange = vi.fn();
    const onDiscussionPointChange = vi.fn();
    render(
      <MeetingDiscussionCard
        title="Old topic"
        discussionPoint="Old discussion"
        onTitleChange={onTitleChange}
        onDiscussionPointChange={onDiscussionPointChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Discussion topic"), { target: { value: "Updated topic" } });
    fireEvent.change(screen.getByLabelText("Discussion point"), { target: { value: "Updated discussion" } });
    expect(onTitleChange).toHaveBeenCalledWith("Updated topic");
    expect(onDiscussionPointChange).toHaveBeenCalledWith("Updated discussion");
  });
});

describe("MeetingActionItemsTable", () => {
  it("shows the agreed four columns and updates an action field", () => {
    const onChange = vi.fn();
    render(
      <MeetingActionItemsTable
        items={[{
          id: "dp-1",
          topicTitle: "Account renewal",
          discussionPoint: "The team reviewed the renewal.",
          actionPlan: "Send revised terms",
          targetDate: "2026-11-02",
          personInCharge: "Mika Santos",
        }]}
        onChange={onChange}
      />,
    );

    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Discussion Point",
      "Action Plan",
      "Target Date",
      "Person in Charge",
    ]);
    expect(screen.getByDisplayValue("The team reviewed the renewal.")).toBeTruthy();
    fireEvent.change(screen.getByDisplayValue("Send revised terms"), { target: { value: "Send final terms" } });
    expect(onChange).toHaveBeenCalledWith("dp-1", "actionPlan", "Send final terms");
    fireEvent.change(screen.getByDisplayValue("2026-11-02"), { target: { value: "2026-11-05" } });
    expect(onChange).toHaveBeenCalledWith("dp-1", "targetDate", "2026-11-05");
    fireEvent.change(screen.getByDisplayValue("Mika Santos"), { target: { value: "Mika Ramos" } });
    expect(onChange).toHaveBeenCalledWith("dp-1", "personInCharge", "Mika Ramos");
  });
});
