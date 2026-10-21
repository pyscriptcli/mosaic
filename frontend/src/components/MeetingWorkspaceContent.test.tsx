// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeetingActionItemsTable, MeetingDiscussionCard } from "./MeetingWorkspaceContent";

afterEach(cleanup);

const members = [
  { id: "11", username: "Alex Cruz", email: "alex@primephilippines.com" },
  { id: "12", username: "Bea Santos", email: "bea@primephilippines.com" },
];

describe("MeetingDiscussionCard", () => {
  it("keeps discussion content separate, editable in place, and offers an add-as-action control", () => {
    const onAddAction = vi.fn();
    const onDiscussionPointChange = vi.fn();
    render(
      <MeetingDiscussionCard
        title="Advisor account update"
        discussionPoint="The team reviewed the renewal."
        evidenceQuote="[00:18] The client asked about renewal timing."
        onDiscussionPointChange={onDiscussionPointChange}
        onAddAction={onAddAction}
      />,
    );

    expect(screen.getByRole("heading", { name: "Advisor account update" })).toBeTruthy();
    expect(screen.getByText("[00:18] The client asked about renewal timing.")).toBeTruthy();
    expect(screen.queryByText("Send revised terms")).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit discussion" })).toBeNull();
    const editor = screen.getByRole("textbox", { name: "Discussion point" });
    editor.innerHTML = "<ul><li>Renewal timing was reviewed.</li></ul>";
    fireEvent.input(editor);
    expect(onDiscussionPointChange).toHaveBeenCalledWith("- Renewal timing was reviewed.");
    fireEvent.click(screen.getByRole("button", { name: "Add as action item" }));
    expect(onAddAction).toHaveBeenCalledOnce();
  });

  it("renders escaped markdown bullets as real bullets and emphasized text", () => {
    render(<MeetingDiscussionCard title="Account update" discussionPoint="- Prime was founded in \\*\\*2013\\*\\*." />);
    const bold = screen.getByText("2013");
    expect(bold.closest("li")?.textContent).toBe("Prime was founded in 2013.");
    expect(bold.tagName).toBe("STRONG");
    expect(screen.queryByText(/\\\*\\\*/)).toBeNull();
  });
});

describe("MeetingActionItemsTable", () => {
  it("shows linked source discussion separately from an editable action and blank date", () => {
    const onChange = vi.fn();
    render(
      <MeetingActionItemsTable
        items={[{
          id: "action-1",
          discussionPointId: "dp-1",
          discussionPointTitle: "Account renewal",
          discussionPoint: "The team reviewed the renewal.",
          actionPlan: "Send revised terms",
          targetDate: "",
          personInCharge: "",
        }]}
        members={members}
        onChange={onChange}
      />,
    );

    const card = screen.getByRole("heading", { name: "Account renewal" }).closest("article");
    expect(card).toBeTruthy();
    expect(within(card!).getByText("The team reviewed the renewal.")).toBeTruthy();
    expect((within(card!).getByLabelText("Action Plan") as HTMLTextAreaElement).value).toBe("Send revised terms");
    expect(within(card!).queryByLabelText("Discussion Point")).toBeNull();
    expect(within(card!).getByLabelText("Target Date").getAttribute("type")).toBe("date");
    expect((within(card!).getByLabelText("Target Date") as HTMLInputElement).value).toBe("");
    expect(within(card!).getByLabelText("Person in Charge")).toBeTruthy();
  });

  it("updates action fields, supports free text, and offers searchable ClickUp members", () => {
    const onChange = vi.fn();
    const actionItem = {
      id: "action-1",
      discussionPointId: "dp-1",
      discussionPointTitle: "Account renewal",
      discussionPoint: "The team reviewed the renewal.",
      actionPlan: "Send revised terms",
      targetDate: "",
      personInCharge: "",
      assigneeIds: [] as string[],
    };
    const { rerender } = render(
      <MeetingActionItemsTable
        items={[actionItem]}
        members={members}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Action Plan"), { target: { value: "Send final terms" } });
    expect(onChange).toHaveBeenCalledWith("action-1", "actionPlan", "Send final terms");
    fireEvent.change(screen.getByLabelText("Person in Charge"), { target: { value: "External consultant" } });
    expect(onChange).toHaveBeenCalledWith("action-1", "personInCharge", "External consultant", []);

    fireEvent.click(screen.getByRole("button", { name: "Choose ClickUp members" }));
    fireEvent.change(screen.getByPlaceholderText("Search ClickUp members..."), { target: { value: "Alex" } });
    fireEvent.click(screen.getByRole("button", { name: "Toggle Alex Cruz" }));
    expect(onChange).toHaveBeenCalledWith("action-1", "personInCharge", "Alex Cruz", ["11"]);
    rerender(<MeetingActionItemsTable items={[{ ...actionItem, personInCharge: "Alex Cruz", assigneeIds: ["11"] }]} members={members} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText("Search ClickUp members..."), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Toggle Bea Santos" }));
    expect(onChange).toHaveBeenLastCalledWith("action-1", "personInCharge", "Alex Cruz, Bea Santos", ["11", "12"]);
  });
});
