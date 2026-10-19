import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Animated,
  useColorScheme,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../types/navigation';
import type { Trade, TradeStatus } from '../types/trade';
import { useTradeStore } from '../stores/tradeStore';
import { useAuthStore } from '../stores/authStore';
import { usePendingTradeStore } from '../stores/pendingTradeStore';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import type { PendingTrade } from '../services/offline.service';
import { AdminErrorBanner } from '../components/AdminErrorBanner';
import { buildSupportMailto } from '../constants/support';
import { formatAmount } from '../utils/formatAmount';
import { getTheme } from '../constants/theme';

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

function TradeCard({
  trade,
  onPress,
  onLongPress,
}: {
  trade: Trade;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const statusColor = STATUS_COLORS[trade.status] ?? '#6B7280';
  const shortBuyer = `${trade.buyerAddress.slice(0, 6)}…${trade.buyerAddress.slice(-4)}`;
  const shortSeller = `${trade.sellerAddress.slice(0, 6)}…${trade.sellerAddress.slice(-4)}`;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      activeOpacity={0.75}
      accessibilityHint="Long-press to copy the trade ID"
      testID={`trade-card-${trade.tradeId}`}
    >
      <View style={styles.cardRow}>
        <Text style={styles.tradeId}>#{trade.tradeId.slice(0, 8)}</Text>
        <View style={[styles.statusBadge, { backgroundColor: `${statusColor}22` }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{trade.status}</Text>
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

function PendingTradeCard({
  entry,
  onRetry,
  onDismiss,
}: {
  entry: PendingTrade;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const failed = entry.status === 'failed';
  const color = failed ? '#EF4444' : '#6B7280';
  return (
    <View style={[styles.card, styles.pendingCard]} testID={`pending-trade-${entry.localId}`}>
      <View style={styles.cardRow}>
        <Text style={styles.tradeId}>{entry.payload.commodity ?? 'Trade'} · not yet synced</Text>
        <View style={[styles.statusBadge, { backgroundColor: `${color}22` }]}>
          <Text style={[styles.statusText, { color }]}>{failed ? 'SYNC FAILED' : 'PENDING SYNC'}</Text>
        </View>
      </View>
      <Text style={styles.amount}>{formatAmount(entry.payload.amountUsdc, 'USDC')} USDC</Text>
      {failed ? (
        <>
          <Text style={styles.pendingError}>{entry.error}</Text>
          <View style={styles.pendingActions}>
            <TouchableOpacity onPress={onRetry}>
              <Text style={styles.pendingAction}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDismiss}>
              <Text style={[styles.pendingAction, { color: '#6B7280' }]}>Discard</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <Text style={styles.addressLabel}>Will be created when you're back online.</Text>
      )}
    </View>
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
  const { isOffline } = useNetworkStatus();
  const {
    pendingTrades,
    load: loadPending,
    sync: syncPending,
    retry: retryPending,
    dismiss: dismissPending,
  } = usePendingTradeStore();

  // Brief "copied" toast for the long-press action (issue #265).
  const [toast, setToast] = useState<string | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (message: string) => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToast(message);
      Animated.timing(toastOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      toastTimer.current = setTimeout(() => {
        Animated.timing(toastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() =>
          setToast(null)
        );
      }, 1800);
    },
    [toastOpacity]
  );

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const copyTradeId = useCallback(
    async (tradeId: string) => {
      await Clipboard.setStringAsync(tradeId);
      showToast('Trade ID copied');
    },
    [showToast]
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

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  // Replay offline-created trades whenever we're (back) online, then refresh
  // the list so synced trades show up as real ones (issue #268).
  useEffect(() => {
    if (isOffline) return;
    void syncPending().then((result) => {
      if (!result) return;
      if (result.created.length > 0) load();
      if (result.failed.length > 0) {
        showToast(
          result.failed.length === 1
            ? 'An offline trade could not be created'
            : `${result.failed.length} offline trades could not be created`
        );
      }
    });
  }, [isOffline, syncPending, load, showToast]);

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
          <TouchableOpacity onPress={() => navigation.navigate('NotificationsInbox')}>
            <Text style={[styles.createBtnText, { color: theme.primary }]}>🔔</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('CreateTrade')}>
            <Text style={[styles.createBtnText, { color: theme.primary }]}>+ New</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('About')}>
            <Text style={[styles.createBtnText, { color: theme.primary }]}>ⓘ</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout}>
            <Text style={[styles.logoutText, { color: theme.textMuted }]}>Logout</Text>
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

      {/* List */}
      {isLoading && !refreshing ? (
        <View style={[styles.center, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={trades}
          keyExtractor={(item) => item.tradeId}
          contentContainerStyle={
            trades.length === 0 && pendingTrades.length === 0 ? styles.emptyContainer : styles.listContent
          }
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
              onPress={() => navigation.navigate('TradeDetail', { tradeId: item.tradeId })}
              onLongPress={() => void copyTradeId(item.tradeId)}
            />
          )}
          ListHeaderComponent={
            pendingTrades.length > 0 ? (
              <View style={styles.pendingList}>
                {pendingTrades.map((p) => (
                  <PendingTradeCard
                    key={p.localId}
                    entry={p}
                    onRetry={() => {
                      void retryPending(p.localId).then(() => (isOffline ? undefined : syncPending()));
                    }}
                    onDismiss={() => void dismissPending(p.localId)}
                  />
                ))}
              </View>
            ) : null
          }
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

      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.toast, { opacity: toastOpacity, bottom: insets.bottom + 24 }]}
          accessibilityLiveRegion="polite"
          testID="trade-list-toast"
        >
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      ) : null}
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
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tradeId: { fontSize: 13, color: '#6b7a6b', fontWeight: '600' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '700' },
  amount: { fontSize: 20, fontWeight: '700', color: '#1a3a1a' },
  addressLabel: { fontSize: 12, color: '#6b7a6b' },
  address: { color: '#1a3a1a', fontWeight: '600' },
  pendingList: { gap: 12, marginBottom: 12 },
  pendingCard: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#cbd5cb' },
  pendingError: { fontSize: 12, color: '#B91C1C' },
  pendingActions: { flexDirection: 'row', gap: 16 },
  pendingAction: { fontSize: 13, fontWeight: '700', color: '#2d6a2d' },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: '#1a3a1a',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
