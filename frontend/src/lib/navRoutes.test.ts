import { describe, expect, it } from "vitest";
import { navRouteForView, navViewForPath } from "./navRoutes";
import { ALL_APP_PAGES } from "./access-control";

describe("Property Decks route and access registration", () => {
  it("maps property-decks view to /property-decks route and back", () => {
    expect(navRouteForView("property-decks")).toBe("/property-decks");
    expect(navViewForPath("/property-decks")).toBe("property-decks");
    expect(navViewForPath("/property-decks/")).toBe("property-decks");
  });

  it("includes property-decks in ALL_APP_PAGES", () => {
    expect(ALL_APP_PAGES).toContain("property-decks");
  });
});
