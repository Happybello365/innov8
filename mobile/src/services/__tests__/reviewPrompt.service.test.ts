/* eslint-disable no-undef */
import * as SecureStore from 'expo-secure-store';
import {
  recordPositiveMilestoneAndMaybePrompt,
  reviewPromptBlockReason,
  EMPTY_REVIEW_PROMPT_STATE,
} from '../reviewPrompt.service';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const config = { enabled: true, storeUrl: 'https://apps.apple.com/app/id123' };
const day = 86_400_000;

it('reserves the prompt before presenting and suppresses concurrent prompts', async () => {
  let saved: string | null = null;
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async () => saved);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (_key, value) => {
    saved = value;
  });
  const present = jest.fn(async () => 'later' as const);

  const results = await Promise.all(Array.from({ length: 4 }, () =>
    recordPositiveMilestoneAndMaybePrompt({ config, present }),
  ));

  expect(results).toEqual([false, true, false, false]);
  expect(present).toHaveBeenCalledTimes(1);
});

it('suppresses a prompt if its frequency limit cannot be persisted', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(JSON.stringify({
    ...EMPTY_REVIEW_PROMPT_STATE, positiveMilestones: 1,
  }));
  jest.mocked(SecureStore.setItemAsync).mockRejectedValue(new Error('Storage unavailable'));
  const present = jest.fn(async () => 'rate' as const);
  await expect(recordPositiveMilestoneAndMaybePrompt({ config, present })).resolves.toBe(false);
  expect(present).toHaveBeenCalledTimes(0);
});

it('enforces opt-out, dispute quiet period and rolling cap', () => {
  const now = 500 * day;
  const state = { ...EMPTY_REVIEW_PROMPT_STATE, positiveMilestones: 2 };
  expect(reviewPromptBlockReason({ ...state, optedOut: true }, config, now)).toBe('opted-out');
  expect(reviewPromptBlockReason({ ...state, lastNegativeAt: now - day }, config, now)).toBe('recent-negative');
  expect(reviewPromptBlockReason({ ...state, promptedAt: [now - 360 * day, now - 240 * day, now - 120 * day] }, config, now)).toBe('yearly-cap');
});
