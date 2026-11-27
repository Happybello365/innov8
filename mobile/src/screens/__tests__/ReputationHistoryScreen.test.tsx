/* eslint-disable no-undef */
import { render, waitFor } from '@testing-library/react-native';
import ReputationHistoryScreen, { summarizeReputation } from '../ReputationHistoryScreen';
import { reputationApi } from '../../api/reputation';

jest.mock('../../api/reputation', () => ({
  reputationApi: { getMyReputationHistory: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockHistory = reputationApi.getMyReputationHistory as jest.Mock;

function renderScreen() {
  const props = {
    navigation: { goBack: jest.fn() },
    route: { key: 'k', name: 'ReputationHistory' },
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return render(<ReputationHistoryScreen {...props} />);
}

describe('summarizeReputation', () => {
  it('describes empty, single and trending histories', () => {
    expect(summarizeReputation([])).toBe('No reputation history yet.');
    expect(summarizeReputation([{ score: 50, recordedAt: '2026-01-01' }])).toMatch(
      /score is 50.*one data point/,
    );
    expect(
      summarizeReputation([
        { score: 50, recordedAt: '2026-01-01' },
        { score: 62, recordedAt: '2026-02-01' },
      ]),
    ).toBe('Current reputation score is 62, up 12 across 2 data points.');
  });
});

describe('ReputationHistoryScreen', () => {
  it('renders the empty state without a chart', async () => {
    mockHistory.mockResolvedValueOnce([]);
    const { getByText, queryByTestId } = renderScreen();
    await waitFor(() => expect(getByText('No reputation history yet.')).toBeTruthy());
    expect(queryByTestId('reputation-chart')).toBeNull();
  });

  it('renders sparse history with a text summary alongside the chart', async () => {
    mockHistory.mockResolvedValueOnce([
      { score: 70, recordedAt: '2026-03-01T00:00:00.000Z' },
      { score: 55, recordedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    const { getByTestId } = renderScreen();
    await waitFor(() => expect(getByTestId('reputation-chart')).toBeTruthy());
    expect(getByTestId('reputation-summary').props.children).toBe(
      'Current reputation score is 70, up 15 across 2 data points.',
    );
    expect(getByTestId('reputation-chart').props.accessibilityLabel).toMatch(/score is 70/);
  });
});
