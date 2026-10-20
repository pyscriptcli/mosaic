// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/contracts", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));

import { DeltaReview } from "./DeltaReview";

afterEach(cleanup);

describe("contract document input controls", () => {
  it("keeps the selected file control readable and tracks the chosen input mode", () => {
    render(<DeltaReview persistenceEnabled={false} />);

    const earlierGroup = screen.getByRole("group", { name: "Earlier input type" });
    const chooseFile = within(earlierGroup).getByRole("button", { name: "Choose original file" });
    expect(chooseFile.getAttribute("aria-pressed")).toBe("true");
    expect(chooseFile.style.color).toBe("rgb(0, 51, 102)");

    fireEvent.click(within(earlierGroup).getByRole("button", { name: "Paste text" }));

    expect(chooseFile.getAttribute("aria-pressed")).toBe("false");
    const pasteText = within(earlierGroup).getByRole("button", { name: "Paste text" });
    expect(pasteText.getAttribute("aria-pressed")).toBe("true");
    expect(pasteText.style.color).toBe("rgb(0, 51, 102)");
  });
});
