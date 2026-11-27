"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  DRAFT_STORAGE_KEY,
  discardDraft as removeDraft,
  isConflictingDraft,
  loadDraft,
  parseDraft,
  saveDraft,
  type StoredDraft,
} from "@/lib/tradeDraft";

export type TradeData = {
  // Step 1
  commodity: string;
  quantity: string;
  unit: string;
  pricePerUnit: string;
  currency: string;
  sellerAddress: string;
  // Step 2
  buyerRatio: number;
  sellerRatio: number;
  deliveryDays: string;
  notes: string;
};

export type DraftConflict = {
  /** The newer draft written by another tab. */
  incoming: { data: TradeData; step: number; savedAt: string };
};

type TradeContextType = {
  step: number;
  setStep: (s: number) => void;
  data: TradeData;
  update: (partial: Partial<TradeData>) => void;
  loadTemplate: (templateData: Partial<TradeData>) => void;
  /** ISO timestamp of a draft restored on mount, or null. */
  recoveredDraftAt: string | null;
  /** Hide the "draft restored" notice but keep the restored values. */
  dismissRecovery: () => void;
  /** Throw away the saved draft and reset the wizard. */
  discardDraft: () => void;
  /** Set when another tab saved a newer draft. */
  conflict: DraftConflict | null;
  /** Load the newer draft from the other tab (last write wins). */
  acceptIncomingDraft: () => void;
  /** Keep this tab's edits and overwrite the other tab's draft. */
  keepLocalDraft: () => void;
};

const defaults: TradeData = {
  commodity: "",
  quantity: "",
  unit: "kg",
  pricePerUnit: "",
  currency: "NGN",
  sellerAddress: "",
  buyerRatio: 50,
  sellerRatio: 50,
  deliveryDays: "7",
  notes: "",
};

const TradeContext = createContext<TradeContextType>({} as TradeContextType);

export function TradeProvider({ children }: { children: React.ReactNode }) {
  const initial = useRef<StoredDraft<TradeData> | null | undefined>(undefined);
  if (initial.current === undefined) {
    initial.current = loadDraft<TradeData>();
  }
  const [step, setStep] = useState(1);
  const [data, setData] = useState<TradeData>(() =>
    initial.current ? ({ ...defaults, ...initial.current.data } as TradeData) : defaults,
  );
  const [recoveredDraftAt, setRecoveredDraftAt] = useState<string | null>(
    initial.current?.savedAt ?? null,
  );
  const [conflict, setConflict] = useState<DraftConflict | null>(null);
  const lastSavedAt = useRef<string | null>(initial.current?.savedAt ?? null);
  const lastSerialized = useRef<string | null>(
    initial.current ? JSON.stringify({ data: { ...defaults, ...initial.current.data }, step: initial.current.step }) : null,
  );
  const skipNextSave = useRef(false);

  // Autosave (#479): persist on change; skip no-op writes so an idle tab never
  // stamps itself as the newest writer and triggers spurious conflicts.
  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const serialized = JSON.stringify({ data, step });
    if (serialized === lastSerialized.current) return;
    if (!lastSerialized.current && serialized === JSON.stringify({ data: defaults, step: 1 })) return;
    const saved = saveDraft(data, step);
    lastSerialized.current = serialized;
    if (saved) lastSavedAt.current = saved.savedAt;
  }, [data, step]);

  // Restore step on mount
  useEffect(() => {
    if (initial.current?.step) setStep(initial.current.step);
  }, []);

  // Multi-tab conflict detection (#480)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== DRAFT_STORAGE_KEY) return;
      const incoming = parseDraft<TradeData>(e.newValue);
      if (!incoming) return;
      if (!isConflictingDraft(incoming, lastSavedAt.current)) return;
      const merged = { ...defaults, ...incoming.data } as TradeData;
      if (JSON.stringify({ data: merged, step: incoming.step }) === lastSerialized.current) return;
      setConflict({ incoming: { data: merged, step: incoming.step, savedAt: incoming.savedAt } });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const acceptIncomingDraft = useCallback(() => {
    setConflict((c) => {
      if (c) {
        skipNextSave.current = true;
        lastSavedAt.current = c.incoming.savedAt;
        lastSerialized.current = JSON.stringify({ data: c.incoming.data, step: c.incoming.step });
        setData(c.incoming.data);
        setStep(c.incoming.step);
      }
      return null;
    });
  }, []);

  const keepLocalDraft = useCallback(() => {
    setConflict(null);
    const saved = saveDraft(data, step);
    lastSerialized.current = JSON.stringify({ data, step });
    if (saved) lastSavedAt.current = saved.savedAt;
  }, [data, step]);

  const discardDraft = useCallback(() => {
    removeDraft();
    skipNextSave.current = true;
    lastSerialized.current = null;
    lastSavedAt.current = null;
    setRecoveredDraftAt(null);
    setConflict(null);
    setData(defaults);
    setStep(1);
  }, []);

  const dismissRecovery = useCallback(() => setRecoveredDraftAt(null), []);

const update = (partial: Partial<TradeData>) =>
    setData((prev) => ({ ...prev, ...partial }));

  const loadTemplate = (templateData: Partial<TradeData>) =>
    setData((prev) => ({ ...prev, ...templateData }));

  return (
    <TradeContext.Provider value={{
        step, setStep, data, update, loadTemplate,
        recoveredDraftAt, dismissRecovery, discardDraft,
        conflict, acceptIncomingDraft, keepLocalDraft,
      }}>
      {children}
    </TradeContext.Provider>
  );
}

export const useTrade = () => useContext(TradeContext);
