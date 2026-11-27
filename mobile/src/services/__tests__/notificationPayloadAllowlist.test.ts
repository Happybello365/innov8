import { NOTIFICATION_HOME_TARGET, targetForNotification } from '../notificationRouting';

jest.mock('../notification.service', () => ({}));

/**
 * Notification payload allowlist (issue #519).
 *
 * Only `tradeId` may steer navigation. Unknown, extra, or misleading fields in
 * a push payload (`screen`, `type`, `disputeId`, admin-looking keys) must be
 * ignored, so a crafted payload cannot open an arbitrary or privileged screen.
 */
describe('notification payload allowlist (issue #519)', () => {
  it('ignores unknown fields and only keeps tradeId in the target params', () => {
    const target = targetForNotification({
      tradeId: 'T-1',
      screen: 'AdminContract',
      admin: true,
      extra: 'x',
    } as never);

    expect(target).toEqual({ screen: 'TradeDetail', params: { tradeId: 'T-1' } });
  });

  it('does not let a payload "screen" field choose the destination', () => {
    const target = targetForNotification({ screen: 'AdminContract' } as never);

    expect(target).toEqual(NOTIFICATION_HOME_TARGET);
  });

  it('does not let the notification "type" change the destination', () => {
    expect(targetForNotification({ type: 'dispute', tradeId: 'T-2' })).toEqual({
      screen: 'TradeDetail',
      params: { tradeId: 'T-2' },
    });
    expect(targetForNotification({ type: 'admin' } as never)).toEqual(NOTIFICATION_HOME_TARGET);
  });

  it('falls back to home for a dispute-only payload, since only trades are routable', () => {
    expect(targetForNotification({ type: 'dispute', disputeId: 'D-1' })).toEqual(
      NOTIFICATION_HOME_TARGET,
    );
  });

  it('trims surrounding whitespace from a valid tradeId', () => {
    expect(targetForNotification({ tradeId: '  T-3  ' })).toEqual({
      screen: 'TradeDetail',
      params: { tradeId: 'T-3' },
    });
  });

  it.each([
    ['an array payload', ['T-1']],
    ['a numeric payload', 7],
    ['a string payload', 'T-1'],
  ])('falls back to home for %s', (_label, data) => {
    expect(targetForNotification(data as never)).toEqual(NOTIFICATION_HOME_TARGET);
  });
});
