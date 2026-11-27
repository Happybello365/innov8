import { NOTIFICATION_HOME_TARGET, targetForNotification } from '../notificationRouting';

jest.mock('../notification.service', () => ({}));

describe('targetForNotification (issue #259)', () => {
  it('routes a trade push to that trade detail screen', () => {
    expect(targetForNotification({ type: 'trade', tradeId: 'T-42' })).toEqual({
      screen: 'TradeDetail',
      params: { tradeId: 'T-42' },
    });
  });

  it('round-trips ids that need URL encoding', () => {
    expect(targetForNotification({ tradeId: 'trade 7&x' })).toEqual({
      screen: 'TradeDetail',
      params: { tradeId: 'trade 7&x' },
    });
  });

  it.each([
    ['missing payload', undefined],
    ['null payload', null],
    ['no tradeId', { type: 'general' }],
    ['empty tradeId', { tradeId: '' }],
    ['blank tradeId', { tradeId: '   ' }],
    ['"undefined" tradeId', { tradeId: 'undefined' }],
    ['"null" tradeId', { tradeId: 'null' }],
    ['tradeId with a path', { tradeId: '1/evidence' }],
    ['non-string tradeId', { tradeId: 42 as unknown as string }],
  ])('falls back to home for %s', (_label, data) => {
    expect(targetForNotification(data as never)).toEqual(NOTIFICATION_HOME_TARGET);
  });
});
