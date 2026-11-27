import { parseDeepLink, type DeepLinkTarget } from '../constants/links';
import type { NotificationData } from './notification.service';

/** Where a push tap lands when it does not identify a reachable trade. */
export const NOTIFICATION_HOME_TARGET: DeepLinkTarget = { screen: 'TradeList' };

/**
 * Map a push notification payload to a navigation target (issue #259).
 *
 * Trade-related pushes carry `tradeId` and open `TradeDetail` directly. The id
 * goes through the shared deep-link parser so a malformed value (empty,
 * non-string, "undefined", embedded slashes…) falls back to the home screen
 * instead of navigating somewhere broken.
 */
export function targetForNotification(data: NotificationData | null | undefined): DeepLinkTarget {
  const tradeId = data?.tradeId;
  if (typeof tradeId !== 'string' || tradeId.trim() === '' || tradeId.includes('/')) {
    return NOTIFICATION_HOME_TARGET;
  }
  const target = parseDeepLink(`/trades/${encodeURIComponent(tradeId.trim())}`);
  return target?.screen === 'TradeDetail' ? target : NOTIFICATION_HOME_TARGET;
}
