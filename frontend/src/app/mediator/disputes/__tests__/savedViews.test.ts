/**
 * Tests for the per-user saved views persistence added in #226.
 */
import { loadSavedViews, persistSavedViews } from "../savedViewsHelpers";

const ADDRESS_A = "GADDR_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const ADDRESS_B = "GADDR_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

beforeEach(() => {
  localStorage.clear();
});

describe("savedViews helpers", () => {
  it("returns an empty array when no views exist", () => {
    expect(loadSavedViews(ADDRESS_A)).toEqual([]);
  });

  it("persists and reloads a saved view", () => {
    persistSavedViews(ADDRESS_A, [{ name: "My view", filter: "OPEN" }]);
    expect(loadSavedViews(ADDRESS_A)).toEqual([{ name: "My view", filter: "OPEN" }]);
  });

  it("isolates saved views per user address", () => {
    persistSavedViews(ADDRESS_A, [{ name: "A view", filter: "OPEN" }]);
    persistSavedViews(ADDRESS_B, [{ name: "B view", filter: "RESOLVED" }]);

    expect(loadSavedViews(ADDRESS_A)).toEqual([{ name: "A view", filter: "OPEN" }]);
    expect(loadSavedViews(ADDRESS_B)).toEqual([{ name: "B view", filter: "RESOLVED" }]);
  });

  it("ignores invalid filter values when loading", () => {
    localStorage.setItem(
      `amana:mediator-saved-views:${ADDRESS_A}`,
      JSON.stringify([
        { name: "Good", filter: "OPEN" },
        { name: "Bad", filter: "INVALID_STATUS" },
      ]),
    );
    const views = loadSavedViews(ADDRESS_A);
    expect(views).toHaveLength(1);
    expect(views[0].name).toBe("Good");
  });

  it("returns empty array for malformed JSON", () => {
    localStorage.setItem(`amana:mediator-saved-views:${ADDRESS_A}`, "not-json");
    expect(loadSavedViews(ADDRESS_A)).toEqual([]);
  });
});
