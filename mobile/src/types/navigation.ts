import type { AdminActionType } from '../screens/AdminActionSuccessScreen';

export type RootStackParamList = {
  WalletConnect: undefined;
  TradeList: undefined;
  TradeDetail: { tradeId: string };
  DisputeDetail: { id: string };
  CreateTrade: undefined;
  EvidenceCapture: { tradeId: string };
  VaultDashboard: undefined;
  /** #261 — contribution history for one savings goal */
  GoalContributionHistory: { goalId: string };
  /** #262 — reputation score trend */
  ReputationHistory: undefined;
  AdminStreamsOverview: undefined;
  AdminTradesBatch: undefined;
  AdminContract: undefined;
  AdminFeatures: undefined;
  /** #85 — confirmation screen after a completed admin operation. */
  AdminActionSuccess: {
    actionType: AdminActionType;
    streamId: string;
    timestamp: string;
  };
  /** #88 — in-app notifications inbox */
  NotificationsInbox: undefined;
  /** #92 — app version and build info */
  About: undefined;
};
