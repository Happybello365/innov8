/**
 * Local persistence for the create-trade wizard draft.
 *
 * #479 – autosave + recovery: drafts are versioned, validated on read and
 *        expire after DRAFT_TTL_MS so a corrupted/stale entry is discarded
 *        instead of crashing the wizard.
 * #480 – multi-tab conflicts: every write is stamped with the writing tab's id
 *        and `savedAt`. When another tab writes a newer draft we raise a
 *        conflict. Resolution policy: **last write wins** – the most recently
 *        saved draft is offered, and the user may keep their own version
 *        instead (which then becomes the newest write).
 */
export const DRAFT_STORAGE_KEY = "amana:draft-trade";
export const DRAFT_VERSION = 1;
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface StoredDraft<T> {
  version: number;
  tabId: string;
  savedAt: string;
  step: number;
  data: T;
}

let cachedTabId: string | null = null;
export function getTabId(): string {
  if (cachedTabId) return cachedTabId;
  cachedTabId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `tab-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  return cachedTabId;
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Parse a raw stored value; returns null for anything invalid, expired or unknown-version. */
export function parseDraft<T extends object>(raw: string | null, now = Date.now()): StoredDraft<T> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.data || typeof parsed.data !== "object") return null;
    // Legacy (unversioned) drafts are accepted and upgraded.
    if (parsed.version !== undefined && parsed.version !== DRAFT_VERSION) return null;
    const savedAtMs = Date.parse(parsed.savedAt);
    if (Number.isNaN(savedAtMs) || now - savedAtMs > DRAFT_TTL_MS) return null;
    const step = Number(parsed.step);
    return {
      version: DRAFT_VERSION,
      tabId: typeof parsed.tabId === "string" ? parsed.tabId : "unknown",
      savedAt: parsed.savedAt,
      step: Number.isInteger(step) && step >= 1 && step <= 3 ? step : 1,
      data: parsed.data as T,
    };
  } catch {
    return null;
  }
}

export function loadDraft<T extends object>(): StoredDraft<T> | null {
  const s = storage();
  if (!s) return null;
  let raw: string | null = null;
  try {
    raw = s.getItem(DRAFT_STORAGE_KEY);
  } catch {
    return null;
  }
  const draft = parseDraft<T>(raw);
  if (raw && !draft) discardDraft(); // corrupt / stale → drop it safely
  return draft;
}

export function saveDraft<T>(data: T, step: number): StoredDraft<T> | null {
  const s = storage();
  if (!s) return null;
  const draft: StoredDraft<T> = {
    version: DRAFT_VERSION,
    tabId: getTabId(),
    savedAt: new Date().toISOString(),
    step,
    data,
  };
  try {
    s.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    return draft;
  } catch {
    return null; // quota exceeded / private mode – autosave is best effort
  }
}

export function discardDraft(): void {
  try {
    storage()?.removeItem(DRAFT_STORAGE_KEY);
  } catch {}
}

/** True when `incoming` was written by another tab after `lastLocalSave`. */
export function isConflictingDraft<T>(
  incoming: StoredDraft<T> | null,
  lastLocalSave: string | null,
  tabId: string = getTabId(),
): boolean {
  if (!incoming || incoming.tabId === tabId) return false;
  if (!lastLocalSave) return true;
  return Date.parse(incoming.savedAt) > Date.parse(lastLocalSave);
}
