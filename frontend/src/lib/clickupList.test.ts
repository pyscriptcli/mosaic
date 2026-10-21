import { describe, expect, it } from "vitest";
import { extractClickUpListId } from "./clickupList";

describe("extractClickUpListId", () => {
  it("extracts a list ID from ClickUp list links and preserves plain IDs", () => {
    expect(extractClickUpListId("https://app.clickup.com/123/v/li/abc_42?view=all")).toBe("abc_42");
    expect(extractClickUpListId("https://app.clickup.com/123/v/lists/998877")).toBe("998877");
    expect(extractClickUpListId("abc-123")).toBe("abc-123");
  });
});
