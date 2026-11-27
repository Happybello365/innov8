/* eslint-disable no-undef */
import { render, waitFor } from '@testing-library/react-native';
import GoalContributionHistoryScreen from '../GoalContributionHistoryScreen';
import { goalsApi } from '../../api/goals';

jest.mock('../../api/goals', () => ({
  goalsApi: { getContributionHistory: jest.fn() },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockHistory = goalsApi.getContributionHistory as jest.Mock;

function renderScreen() {
  const props = {
    navigation: { goBack: jest.fn() },
    route: { key: 'k', name: 'GoalContributionHistory', params: { goalId: 'goal-1' } },
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return render(<GoalContributionHistoryScreen {...props} />);
}

describe('GoalContributionHistoryScreen', () => {
  it('renders an empty state with no contributions', async () => {
    mockHistory.mockResolvedValueOnce([]);
    const { getByTestId, getByText, queryAllByTestId } = renderScreen();
    await waitFor(() => expect(getByTestId('contributions-summary')).toBeTruthy());
    expect(getByText('No contributions yet')).toBeTruthy();
    expect(queryAllByTestId('contribution-row')).toHaveLength(0);
    expect(mockHistory).toHaveBeenCalledWith('goal-1');
  });

  it('renders a single contribution with singular wording', async () => {
    mockHistory.mockResolvedValueOnce([
      { id: '1', amountUsdc: '25', createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    const { getByText, getAllByTestId } = renderScreen();
    await waitFor(() => expect(getByText('1 contribution totalling $25.00 USDC')).toBeTruthy());
    expect(getAllByTestId('contribution-row')).toHaveLength(1);
  });

  it('renders several contributions with a total', async () => {
    mockHistory.mockResolvedValueOnce([
      { id: '1', amountUsdc: '25', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: '2', amountUsdc: '10.5', createdAt: '2026-01-02T00:00:00.000Z' },
      { id: '3', amountUsdc: '4.5', createdAt: '2026-01-03T00:00:00.000Z' },
    ]);
    const { getByText, getAllByTestId } = renderScreen();
    await waitFor(() => expect(getByText('3 contributions totalling $40.00 USDC')).toBeTruthy());
    expect(getAllByTestId('contribution-row')).toHaveLength(3);
  });

  it('shows an error with retry when the request fails', async () => {
    mockHistory.mockRejectedValueOnce(new Error('boom'));
    const { getByText } = renderScreen();
    await waitFor(() => expect(getByText('boom')).toBeTruthy());
    expect(getByText('Retry')).toBeTruthy();
  });
});
