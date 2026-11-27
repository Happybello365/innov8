/**
 * Error response localization (#452).
 *
 * Provides optional, locale-aware user-facing messages for structured error
 * responses while keeping machine-readable error codes stable. The strategy:
 *
 *  1. API responses always carry a stable `code` (e.g. `TRADE_NOT_FOUND`) that
 *     clients can branch on without parsing human text.
 *  2. When the caller sends `Accept-Language`, a `localizedMessage` is appended
 *     alongside the default English `message`. Clients that don't send the
 *     header receive no extra field — no breaking change.
 *  3. Translations live in a locale map here. Missing locales fall back to the
 *     default catalog message (English) rather than throwing.
 *
 * Adding a translation: add an entry for the locale in `LOCALE_MESSAGES` below.
 * Adding a locale: add a new key following the BCP-47 two-letter pattern.
 */

import { ErrorCode } from "../errors/errorCodes";

/** BCP-47 locale tag → error code → localized message. */
const LOCALE_MESSAGES: Record<string, Partial<Record<ErrorCode, string>>> = {
  fr: {
    [ErrorCode.VALIDATION_ERROR]: "La validation a échoué",
    [ErrorCode.AUTH_ERROR]: "Authentification requise",
    [ErrorCode.NOT_FOUND]: "Ressource introuvable",
    [ErrorCode.INTERNAL_ERROR]: "Erreur interne du serveur",
    [ErrorCode.TRADE_NOT_FOUND]: "Transaction introuvable",
    [ErrorCode.TRADE_ACCESS_DENIED]: "Accès à cette transaction refusé",
    [ErrorCode.TRADE_INVALID_STATUS]: "Statut de la transaction invalide pour cette action",
    [ErrorCode.DISPUTE_NOT_FOUND]: "Litige introuvable",
    [ErrorCode.RATE_LIMIT_EXCEEDED]: "Trop de requêtes",
    [ErrorCode.DOMAIN_ERROR]: "Règle métier violée",
    [ErrorCode.INFRA_ERROR]: "Un service dépendant est indisponible",
  },
  yo: {
    // Yoruba — spoken widely in Nigeria where the platform operates
    [ErrorCode.VALIDATION_ERROR]: "Àyẹwò kò ṣiṣẹ",
    [ErrorCode.AUTH_ERROR]: "Ìfẹsẹwọnba ni a nílò",
    [ErrorCode.NOT_FOUND]: "A kò rí àgbègbè yẹn",
    [ErrorCode.INTERNAL_ERROR]: "Àṣìṣe ẹ̀rọ inú",
    [ErrorCode.TRADE_NOT_FOUND]: "A kò rí ìṣòwò yẹn",
    [ErrorCode.TRADE_ACCESS_DENIED]: "Ìwọle sí ìṣòwò yẹn kò gba",
    [ErrorCode.RATE_LIMIT_EXCEEDED]: "Ọpọ ìbéèrè jù lọ",
    [ErrorCode.DISPUTE_NOT_FOUND]: "A kò rí ìjiyan yẹn",
  },
  ha: {
    // Hausa — widely spoken across the Nigerian savannah belt
    [ErrorCode.VALIDATION_ERROR]: "Tabbatarwa ta kasa",
    [ErrorCode.AUTH_ERROR]: "Ana buƙatar tabbatar da kai",
    [ErrorCode.NOT_FOUND]: "Ba a sami albarkatun ba",
    [ErrorCode.INTERNAL_ERROR]: "Kuskuren sabar na ciki",
    [ErrorCode.TRADE_NOT_FOUND]: "Ba a sami cinikin ba",
    [ErrorCode.TRADE_ACCESS_DENIED]: "An hana shiga wannan cinikin",
    [ErrorCode.RATE_LIMIT_EXCEEDED]: "Yawan buƙatu ya zarce iyaka",
    [ErrorCode.DISPUTE_NOT_FOUND]: "Ba a sami rikicin ba",
  },
};

/**
 * Parses the `Accept-Language` header and returns the best-matching locale
 * from our supported set, or `null` when no supported locale is found.
 *
 * We only honour the primary language tag (e.g. `fr` from `fr-CA,fr;q=0.9`)
 * and ignore quality weights — this keeps the implementation simple and avoids
 * the complexity of a full content-negotiation library for three locales.
 */
export function parseSupportedLocale(acceptLanguage: string | undefined): string | null {
  if (!acceptLanguage) return null;
  const supported = new Set(Object.keys(LOCALE_MESSAGES));
  const tags = acceptLanguage
    .split(",")
    .map((part) => part.split(";")[0]!.trim().toLowerCase().split("-")[0]!);
  for (const tag of tags) {
    if (supported.has(tag)) return tag;
  }
  return null;
}

/**
 * Returns the localized message for `code` in `locale`, or `null` when no
 * translation exists. The caller falls back to the default English message.
 */
export function getLocalizedMessage(code: string, locale: string): string | null {
  const map = LOCALE_MESSAGES[locale];
  if (!map) return null;
  return (map as Record<string, string | undefined>)[code] ?? null;
}

/** All locale codes that have at least one translation. */
export function getSupportedLocales(): string[] {
  return Object.keys(LOCALE_MESSAGES);
}
