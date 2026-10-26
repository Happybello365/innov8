"use client";

import { useCallback, useEffect, useState } from "react";
import { SUPPORTED_LOCALES, DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";

const STORAGE_KEY = "innov8:locale";

function readStoredLocale(): Locale {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && (SUPPORTED_LOCALES as readonly string[]).includes(raw)) {
      return raw as Locale;
    }
  } catch {
    // localStorage unavailable (private browsing, etc.)
  }
  return DEFAULT_LOCALE;
}

export interface UseLocaleResult {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  supportedLocales: readonly Locale[];
}

export function useLocale(): UseLocaleResult {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocaleState(readStoredLocale());
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable; in-memory only
    }
  }, []);

  return { locale, setLocale, supportedLocales: SUPPORTED_LOCALES };
}
