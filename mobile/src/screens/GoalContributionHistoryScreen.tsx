import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../types/navigation';
import { goalsApi, GoalContribution } from '../api/goals';

type Props = StackScreenProps<RootStackParamList, 'GoalContributionHistory'>;

/** #261 — contribution history for a single savings goal. */
export default function GoalContributionHistoryScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { goalId } = route.params;
  const [contributions, setContributions] = useState<GoalContribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setContributions(await goalsApi.getContributionHistory(goalId));
    } catch (err: unknown) {
      setError((err as Error)?.message ?? 'Failed to load contributions');
    } finally {
      setLoading(false);
    }
  }, [goalId]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = useMemo(
    () => contributions.reduce((sum, c) => sum + parseFloat(c.amountUsdc || '0'), 0),
    [contributions],
  );

  const summary =
    contributions.length === 0
      ? 'No contributions yet'
      : contributions.length === 1
        ? `1 contribution totalling $${total.toFixed(2)} USDC`
        : `${contributions.length} contributions totalling $${total.toFixed(2)} USDC`;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button">
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contribution History</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color="#2d6a2d" testID="contributions-loading" />
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => void load()} accessibilityRole="button">
            <Text style={styles.retry}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={contributions}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            <Text style={styles.summary} testID="contributions-summary" accessibilityRole="summary">
              {summary}
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.row} testID="contribution-row">
              <Text style={styles.rowDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
              <Text style={styles.rowAmount}>+{item.amountUsdc} USDC</Text>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                Contributions you make to this goal will appear here.
              </Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f0' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e8e0',
  },
  back: { fontSize: 14, color: '#2d6a2d', fontWeight: '600' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1a3a1a' },
  loader: { marginTop: 32 },
  listContent: { padding: 16 },
  summary: { fontSize: 14, color: '#374151', marginBottom: 12, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
  },
  rowDate: { fontSize: 13, color: '#6b7280' },
  rowAmount: { fontSize: 14, fontWeight: '600', color: '#065f46' },
  separator: { height: 8 },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { color: '#6b7280', fontSize: 14, textAlign: 'center' },
  errorText: { color: '#b91c1c', fontSize: 14 },
  retry: { color: '#2d6a2d', fontWeight: '600' },
});
