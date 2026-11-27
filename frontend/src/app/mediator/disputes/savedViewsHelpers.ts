export type DisputeStatus = "OPEN" | "UNDER_REVIEW" | "RESOLVED" | "CLOSED";

export interface SavedView {
  name: string;
  filter: DisputeStatus | "all";
}

const VALID_FILTER_VALUES = new Set<DisputeStatus | "all">(["all", "OPEN", "UNDER_REVIEW", "RESOLVED", "CLOSED"]);

export function savedViewsKey(address: string) {
  return `amana:mediator-saved-views:${address}`;
}

export function loadSavedViews(address: string): SavedView[] {
  try {
    const raw = localStorage.getItem(savedViewsKey(address));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is SavedView =>
        typeof v === "object" &&
        typeof v.name === "string" &&
        VALID_FILTER_VALUES.has(v.filter),
    );
  } catch {
    return [];
  }
}

export function persistSavedViews(address: string, views: SavedView[]) {
  try {
    localStorage.setItem(savedViewsKey(address), JSON.stringify(views));
  } catch {}
}
