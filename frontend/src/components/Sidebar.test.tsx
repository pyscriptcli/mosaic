// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

describe("Sidebar Tools navigation", () => {
  it("renders Property Decks under Tools and switches to property-decks view when clicked", () => {
    const onSelectView = vi.fn();
    render(
      <Sidebar
        currentView="dashboard"
        onSelectView={onSelectView}
        isCollapsed={false}
        onToggleCollapse={vi.fn()}
        allowedPages={["dashboard", "meetings", "minutes", "property-decks"]}
      />,
    );

    const button = screen.getByRole("button", { name: /property decks/i });
    expect(button).toBeDefined();
    fireEvent.click(button);
    expect(onSelectView).toHaveBeenCalledWith("property-decks");
  });
});
