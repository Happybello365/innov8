"use client";

import { useLocale } from "@/hooks/useLocale";
import type { Locale } from "@/lib/i18n/config";

const LOCALE_LABELS: Record<Locale, string> = {
  "en-NG": "English",
  "en-US": "English (US)",
  pcm: "Pidgin",
  pseudo: "Pseudo",
};

export function LocaleSwitcher() {
  const { locale, setLocale, supportedLocales } = useLocale();

  const visible = supportedLocales.filter((l) => l !== "pseudo");

  return (
    <select
      aria-label="Select language"
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      className="locale-switcher"
    >
      {visible.map((l) => (
        <option key={l} value={l}>
          {LOCALE_LABELS[l] ?? l}
        </option>
      ))}
    </select>
  );
}
