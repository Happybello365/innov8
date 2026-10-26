import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Linking,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../types/navigation';
import type { Trade, TradeStatus } from '../types/trade';
import { useTradeStore } from '../stores/tradeStore';
import { useAuthStore } from '../stores/authStore';
import { AdminErrorBanner } from '../components/AdminErrorBanner';
import { buildSupportMailto } from '../constants/support';
import { formatAmount } from '../utils/formatAmount';
import { getTheme } from '../constants/theme';
import { useResponsiveLayout } from '../hooks/useResponsiveLayout';
import TradeDetailScreen from './TradeDetailScreen';

type Props = StackScreenProps<RootStackParamList, 'TradeList'>;

const STATUS_FILTERS: Array<{ label: string; value: TradeStatus | 'ALL' }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Active', value: 'IN_TRANSIT' },
  { label: 'Disputed', value: 'DISPUTED' },
  { label: 'Done', value: 'COMPLETED' },
];

const STATUS_COLORS: Record<TradeStatus, string> = {
  PENDING: '#F59E0B',
  FUNDED: '#3B82F6',
  IN_TRANSIT: '#14B8A6',
  DELIVERED: '#34D399',
  DISPUTED: '#EF4444',
  COMPLETED: '#34D399',
  REFUNDED: '#6B7280',
};

// Labels must match web StatusBadge copy verbatim (issue #249).
const STATUS_LABELS: Record<TradeStatus, string> = {
  PENDING: 'Pending',
  FUNDED: 'Funded',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  DISPUTED: 'Disputed',
  COMPLETED: 'Completed',
  REFUNDED: 'Refunded',
};

function TradeCard({ trade, onPress, selected = false }: { trade: Trade; onPress: () => void; selected?: boolean }) {
  const statusColor = STATUS_COLORS[trade.status] ?? '#6B7280';
  const shortBuyer = `${trade.buyerAddress.slice(0, 6)}…${trade.buyerAddress.slice(-4)}`;
  const shortSeller = `${trade.sellerAddress.slice(0, 6)}…${trade.sellerAddress.slice(-4)}`;

  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      testID={`trade-card-${trade.tradeId}`}
    >
      <View style={styles.cardRow}>
        <Text style={styles.tradeId}>#{trade.tradeId.slice(0, 8)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: `${statusColor}22` }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABELS[trade.status] ?? trade.status}</Text>
        </View>
      </View>
      <Text style={styles.amount}>{formatAmount(trade.amountUsdc, 'USDC')} USDC</Text>
      <View style={styles.cardRow}>
        <Text style={styles.addressLabel}>Buyer: <Text style={styles.address}>{shortBuyer}</Text></Text>
        <Text style={styles.addressLabel}>Seller: <Text style={styles.address}>{shortSeller}</Text></Text>
      </View>
    </TouchableOpacity>
  );
}

export default function TradeListScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const theme = getTheme(scheme);
  const { trades, isLoading, errorView, fetchTrades, clearErrorView } = useTradeStore();
  const { clearAuth } = useAuthStore();
  const [activeFilter, setActiveFilter] = useState<TradeStatus | 'ALL'>('ALL');
  const [refreshing, setRefreshing] = useState(false);
  // Two-column list/detail on tablets (#270). On phones the detail is a
  // separate stack screen, so the selection is only used in wide mode.
  const { isTwoColumn, listPaneWidth, contentStyle } = useResponsiveLayout();
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const effectiveSelectedId =
    selectedTradeId && trades.some((t) => t.tradeId === selectedTradeId)
      ? selectedTradeId
      : trades[0]?.tradeId ?? null;

  const openTrade = useCallback(
    (tradeId: string) => {
      if (isTwoColumn) setSelectedTradeId(tradeId);
      else navigation.navigate('TradeDetail', { tradeId });
    },
    [isTwoColumn, navigation],
  );

  const load = useCallback(
    (status?: TradeStatus | 'ALL') => {
      const s = status ?? activeFilter;
      fetchTrades(s === 'ALL' ? undefined : { status: s });
    },
    [activeFilter, fetchTrades]
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchTrades(activeFilter === 'ALL' ? undefined : { status: activeFilter });
    } finally {
      setRefreshing(false);
    }
  }, [activeFilter, fetchTrades]);

  const handleFilterChange = (value: TradeStatus | 'ALL') => {
    setActiveFilter(value);
    fetchTrades(value === 'ALL' ? undefined : { status: value });
  };

  const handleLogout = async () => {
    await clearAuth();
    navigation.replace('WalletConnect');
  };

  // TradeListScreen only triggers load actions (`fetchTrades`), so a
  // single slot is enough — no dual-slot `lastActionErrorView` here.
  const visibleErrorView = errorView;

  const openSupportMailto = useCallback(() => {
    void Linking.openURL(buildSupportMailto(visibleErrorView, 'trade list'));
  }, [visibleErrorView]);

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>🌾 Trades</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => navigation.navigate('NotificationsInbox')}
            accessible
            accessibilityRole="button"
            accessibilityLabel="View notifications"
          >
            <Text style={[styles.createBtnText, { color: theme.primary }]}>🔔</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('CreateTrade')}
            testID="new-trade-btn"
            accessible
            accessibilityRole="button"
            accessibilityLabel="Create new trade"
          >
            <Text style={[styles.createBtnText, { color: theme.primary }]}>+ New</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('About')}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Open about information"
          >
            <Text style={[styles.createBtnText, { color: theme.primary }]}>ⓘ</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout}>
            <Text style={[styles.logoutText, { color: theme.textMuted }]} testID="logout-btn">Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterTab, activeFilter === f.value && styles.filterTabActive]}
            onPress={() => handleFilterChange(f.value)}
          >
            <Text style={[styles.filterLabel, activeFilter === f.value && styles.filterLabelActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Error banner — renders an inline AdminErrorBanner above the
          list using the load slot from the store. */}
      {visibleErrorView ? (
        <View style={styles.bannerWrap}>
          <AdminErrorBanner
            view={visibleErrorView}
            onRetry={() => {
              const s = activeFilter;
              void fetchTrades(s === 'ALL' ? undefined : { status: s });
            }}
            onSignOut={handleLogout}
            onGoBack={clearErrorView}
            onContactSupport={openSupportMailto}
          />
        </View>
      ) : null}

      {/* List (left pane on tablets) + detail (right pane) */}
      <View style={styles.body}>
      <View
        style={[
          isTwoColumn ? { width: listPaneWidth, borderRightWidth: 1, borderRightColor: theme.border } : styles.fill,
          !isTwoColumn && contentStyle,
        ]}
        testID="trade-list-pane"
      >
      {isLoading && !refreshing ? (
        <View style={[styles.center, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={trades}
          keyExtractor={(item) => item.tradeId}
          contentContainerStyle={trades.length === 0 ? styles.emptyContainer : styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#2d6a2d"
              colors={['#2d6a2d']}
            />
          }
          renderItem={({ item }) => (
            <TradeCard
              trade={item}
              selected={isTwoColumn && item.tradeId === effectiveSelectedId}
              onPress={() => openTrade(item.tradeId)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyTitle}>No trades found</Text>
              <Text style={styles.emptyBody}>
                {activeFilter === 'ALL'
                  ? 'You have no trades yet.'
                  : `No trades with status "${activeFilter}".`}
              </Text>
            </View>
          }
        />
      )}
      </View>
      {isTwoColumn ? (
        <View style={styles.fill} testID="trade-detail-pane">
          {effectiveSelectedId ? (
            <TradeDetailScreen
              key={effectiveSelectedId}
              embedded
              route={{ key: `embedded-${effectiveSelectedId}`, name: 'TradeDetail', params: { tradeId: effectiveSelectedId } }}
              navigation={navigation as unknown as Parameters<typeof TradeDetailScreen>[0]['navigation']}
            />
          ) : (
            <View style={styles.center}>
              <Text style={[styles.emptyBody, { color: theme.textMuted }]}>Select a trade to see its details.</Text>
            </View>
          )}
        </View>
      ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f0' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e8e0',
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1a3a1a' },
  headerActions: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  createBtnText: { fontSize: 14, color: '#2d6a2d', fontWeight: '700' },
  logoutText: { fontSize: 14, color: '#2d6a2d', fontWeight: '500' },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e8e0',
    gap: 6,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f0f4f0',
  },
  filterTabActive: { backgroundColor: '#2d6a2d' },
  filterLabel: { fontSize: 13, color: '#4a6a4a', fontWeight: '500' },
  filterLabelActive: { color: '#fff' },
  bannerWrap: { paddingHorizontal: 16, paddingTop: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  body: { flex: 1, flexDirection: 'row' },
  fill: { flex: 1 },
  listContent: { padding: 16, gap: 12 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState: { alignItems: 'center', paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1a3a1a', marginBottom: 6 },
  emptyBody: { fontSize: 14, color: '#6b7a6b', textAlign: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardSelected: { borderWidth: 2, borderColor: '#2d6a2d' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tradeId: { fontSize: 13, color: '#6b7a6b', fontWeight: '600' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '700' },
  amount: { fontSize: 20, fontWeight: '700', color: '#1a3a1a' },
  addressLabel: { fontSize: 12, color: '#6b7a6b' },
  address: { color: '#1a3a1a', fontWeight: '600' },
});
