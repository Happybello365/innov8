import * as SecureStore from 'expo-secure-store';
import { Alert, Linking, Platform } from 'react-native';

/**
 * In-app review prompt guardrails (issue #531).
 *
 * We only ask for a store review after the user has clearly completed
 * positive milestones (a trade that reached COMPLETED), never right after a
 * dispute or failed action, and never more often than the frequency limits
 * below allow. The feature is off unless `EXPO_PUBLIC_REVIEW_PROMPT_ENABLED`
 * is `true` and a store URL for the current platform is configured.
 *
 * Only counters and timestamps are persisted — no trade ids, addresses or
 * amounts — so the stored state carries no PII.
 */

const STATE_KEY = 'amana_review_prompt';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReviewPromptPolicy {
  /** Positive milestones required before the first prompt. */
  minPositiveMilestones: number;
  /** Minimum gap between two prompts. */
  cooldownMs: number;
  /** Hard cap on prompts within a rolling 365-day window (Apple allows 3). */
  maxPromptsPerYear: number;
  /** Quiet period after a negative event (dispute / failed action). */
  negativeQuietMs: number;
}

export const DEFAULT_REVIEW_PROMPT_POLICY: ReviewPromptPolicy = {
  minPositiveMilestones: 2,
  cooldownMs: 120 * DAY_MS,
  maxPromptsPerYear: 3,
  negativeQuietMs: 30 * DAY_MS,
};

export interface ReviewPromptState {
  /** Positive milestones since the last prompt. */
  positiveMilestones: number;
  /** Epoch ms of each prompt shown in the last 365 days. */
  promptedAt: number[];
  /** Epoch ms of the most recent negative event, if any. */
  lastNegativeAt: number | null;
  /** User chose "Don't ask again". */
  optedOut: boolean;
}

export const EMPTY_REVIEW_PROMPT_STATE: ReviewPromptState = {
  positiveMilestones: 0,
  promptedAt: [],
  lastNegativeAt: null,
  optedOut: false,
};

export interface ReviewPromptConfig {
  enabled: boolean;
  storeUrl: string | null;
}

export type ReviewPromptBlockReason =
  | 'disabled'
  | 'no-store-url'
  | 'opted-out'
  | 'not-enough-milestones'
  | 'recent-negative'
  | 'cooldown'
  | 'yearly-cap';

const ALLOWED_STORE_URL = /^(https:\/\/|itms-apps:\/\/|market:\/\/)[^\s]+$/i;

/** Only https / store-scheme URLs are accepted; anything else disables prompting. */
export function sanitizeStoreUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  return ALLOWED_STORE_URL.test(trimmed) ? trimmed : null;
}

export function getReviewPromptConfig(
  env: Record<string, string | undefined> = {
    EXPO_PUBLIC_REVIEW_PROMPT_ENABLED: process.env.EXPO_PUBLIC_REVIEW_PROMPT_ENABLED,
    EXPO_PUBLIC_REVIEW_IOS_STORE_URL: process.env.EXPO_PUBLIC_REVIEW_IOS_STORE_URL,
    EXPO_PUBLIC_REVIEW_ANDROID_STORE_URL: process.env.EXPO_PUBLIC_REVIEW_ANDROID_STORE_URL,
  },
  os: string = Platform.OS,
): ReviewPromptConfig {
  const enabled = (os === 'ios' || os === 'android') && env.EXPO_PUBLIC_REVIEW_PROMPT_ENABLED === 'true';
  const raw =
    os === 'ios' ? env.EXPO_PUBLIC_REVIEW_IOS_STORE_URL : env.EXPO_PUBLIC_REVIEW_ANDROID_STORE_URL;
  return { enabled, storeUrl: sanitizeStoreUrl(raw) };
}

function sanitizeState(raw: unknown): ReviewPromptState {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_REVIEW_PROMPT_STATE };
  const r = raw as Partial<ReviewPromptState>;
  const count =
    typeof r.positiveMilestones === 'number' && Number.isFinite(r.positiveMilestones) && r.positiveMilestones > 0
      ? Math.floor(r.positiveMilestones)
      : 0;
  return {
    positiveMilestones: count,
    promptedAt: Array.isArray(r.promptedAt)
      ? r.promptedAt.filter((t): t is number => typeof t === 'number' && Number.isFinite(t))
      : [],
    lastNegativeAt:
      typeof r.lastNegativeAt === 'number' && Number.isFinite(r.lastNegativeAt) ? r.lastNegativeAt : null,
    optedOut: r.optedOut === true,
  };
}

async function loadReviewPromptState(): Promise<ReviewPromptState> {
  const raw = await SecureStore.getItemAsync(STATE_KEY);
  return raw ? sanitizeState(JSON.parse(raw)) : EMPTY_REVIEW_PROMPT_STATE;
}

async function saveReviewPromptState(state: ReviewPromptState): Promise<void> {
  await SecureStore.setItemAsync(STATE_KEY, JSON.stringify(state));
}

let pending: Promise<unknown> = Promise.resolve();

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation);
  pending = result.catch(() => undefined);
  return result;
}

/**
 * Pure eligibility check. Returns `null` when a prompt may be shown, otherwise
 * the first guardrail that blocks it.
 */
export function reviewPromptBlockReason(
  state: ReviewPromptState,
  config: ReviewPromptConfig,
  now: number = Date.now(),
  policy: ReviewPromptPolicy = DEFAULT_REVIEW_PROMPT_POLICY,
): ReviewPromptBlockReason | null {
  if (!config.enabled) return 'disabled';
  if (!config.storeUrl) return 'no-store-url';
  if (state.optedOut) return 'opted-out';
  if (state.positiveMilestones < policy.minPositiveMilestones) return 'not-enough-milestones';
  if (state.lastNegativeAt !== null && now - state.lastNegativeAt < policy.negativeQuietMs) {
    return 'recent-negative';
  }
  const lastPrompt = state.promptedAt.length ? Math.max(...state.promptedAt) : null;
  if (lastPrompt !== null && now - lastPrompt < policy.cooldownMs) return 'cooldown';
  const inLastYear = state.promptedAt.filter((t) => now - t < 365 * DAY_MS);
  if (inLastYear.length >= policy.maxPromptsPerYear) return 'yearly-cap';
  return null;
}

/** Record a dispute or failed action; starts the quiet period. */
export async function recordNegativeReviewEvent(now: number = Date.now()): Promise<void> {
  if (!getReviewPromptConfig().enabled) return;
  await serialize(async () => {
    const state = await loadReviewPromptState();
    await saveReviewPromptState({ ...state, lastNegativeAt: now });
  }).catch(() => undefined);
}

export type ReviewPromptChoice = 'rate' | 'later' | 'never';

/** Default UI: a native alert with Rate / Not now / Don't ask again. */
export function presentReviewAlert(): Promise<ReviewPromptChoice> {
  return new Promise((resolve) => {
    Alert.alert(
      'Enjoying Amana Vault?',
      'Your trade is complete. Would you mind rating the app? It helps other farmers and buyers find us.',
      [
        { text: 'Not now', style: 'cancel', onPress: () => resolve('later') },
        { text: "Don't ask again", style: 'destructive', onPress: () => resolve('never') },
        { text: 'Rate', style: 'default', onPress: () => resolve('rate') },
      ],
      { cancelable: true, onDismiss: () => resolve('later') },
    );
  });
}

export interface MaybeRequestReviewOptions {
  now?: number;
  config?: ReviewPromptConfig;
  policy?: ReviewPromptPolicy;
  present?: () => Promise<ReviewPromptChoice>;
  openUrl?: (url: string) => Promise<unknown>;
}

/**
 * Record a positive, clearly completed milestone and show the review prompt
 * if every guardrail allows it. Resolves to `true` when the prompt was shown.
 * Never throws: failures (storage, alert, store link) resolve to `false`.
 */
export async function recordPositiveMilestoneAndMaybePrompt(
  options: MaybeRequestReviewOptions = {},
): Promise<boolean> {
  const {
    now = Date.now(),
    config = getReviewPromptConfig(),
    policy = DEFAULT_REVIEW_PROMPT_POLICY,
    present = presentReviewAlert,
    openUrl = (url: string) => Linking.openURL(url),
  } = options;

  if (!config.enabled || !config.storeUrl) return false;
  return serialize(async () => {
    const loaded = await loadReviewPromptState();
    const state: ReviewPromptState = {
      ...loaded,
      positiveMilestones: loaded.positiveMilestones + 1,
      promptedAt: loaded.promptedAt.filter((t) => now - t < 365 * DAY_MS),
    };

    if (reviewPromptBlockReason(state, config, now, policy) !== null) {
      await saveReviewPromptState(state);
      return false;
    }

    // Count the prompt before showing it so a crash mid-prompt can't cause a re-ask.
    const prompted: ReviewPromptState = {
      ...state,
      positiveMilestones: 0,
      promptedAt: [...state.promptedAt, now],
    };
    await saveReviewPromptState(prompted);

    const choice = await present();
    if (choice === 'never') {
      await saveReviewPromptState({ ...prompted, optedOut: true });
    } else if (choice === 'rate' && config.storeUrl) {
      try {
        await openUrl(config.storeUrl);
      } catch {
        // Store unavailable — nothing else to do.
      }
    }
    return true;
  }).catch(() => false);
}
