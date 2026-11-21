import {
  DRAFT_STORAGE_KEY,
  DRAFT_TTL_MS,
  discardDraft,
  getTabId,
  isConflictingDraft,
  loadDraft,
  parseDraft,
  saveDraft,
} from "../tradeDraft";

describe("tradeDraft", () => {
  beforeEach(() => localStorage.clear());

  it("saves and loads a draft stamped with tab id and version", () => {
    saveDraft({ commodity: "Maize" }, 2);
    const draft = loadDraft<{ commodity: string }>();
    expect(draft?.data.commodity).toBe("Maize");
    expect(draft?.step).toBe(2);
    expect(draft?.tabId).toBe(getTabId());
    expect(draft?.version).toBe(1);
  });

  it("discards corrupt drafts safely", () => {
    localStorage.setItem(DRAFT_STORAGE_KEY, "{not json");
    expect(loadDraft()).toBeNull();
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("discards expired drafts", () => {
    const old = new Date(Date.now() - DRAFT_TTL_MS - 1000).toISOString();
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ data: { a: 1 }, step: 1, savedAt: old }));
    expect(loadDraft()).toBeNull();
  });

  it("rejects unknown versions and clamps invalid steps", () => {
    const now = new Date().toISOString();
    expect(parseDraft(JSON.stringify({ version: 99, data: {}, savedAt: now }))).toBeNull();
    expect(parseDraft(JSON.stringify({ data: {}, step: 42, savedAt: now }))?.step).toBe(1);
  });

  it("discardDraft removes the entry", () => {
    saveDraft({}, 1);
    discardDraft();
    expect(localStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("survives storage write failures", () => {
    const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(saveDraft({}, 1)).toBeNull();
    spy.mockRestore();
  });

  describe("isConflictingDraft", () => {
    const base = { version: 1, step: 1, data: {} };
    it("ignores writes from the same tab", () => {
      expect(isConflictingDraft({ ...base, tabId: "a", savedAt: new Date().toISOString() }, null, "a")).toBe(false);
    });
    it("flags newer writes from another tab", () => {
      const local = new Date(1000).toISOString();
      const incoming = new Date(2000).toISOString();
      expect(isConflictingDraft({ ...base, tabId: "b", savedAt: incoming }, local, "a")).toBe(true);
      expect(isConflictingDraft({ ...base, tabId: "b", savedAt: local }, incoming, "a")).toBe(false);
    });
  });
});
