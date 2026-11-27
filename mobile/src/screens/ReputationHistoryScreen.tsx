import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../types/navigation';
import { reputationApi, ReputationHistoryPoint } from '../api/reputation';

type Props = StackScreenProps<RootStackParamList, 'ReputationHistory'>;

const CHART_HEIGHT = 120;

/** Plain-language trend summary so screen readers get the same info as the chart. */
export function summarizeReputation(points: ReputationHistoryPoint[]): string {
  if (points.length === 0) return 'No reputation history yet.';
  const latest = points[points.length - 1].score;
  if (points.length === 1) return `Current reputation score is ${latest}. Only one data point so far.`;
  const first = points[0].score;
  const delta = latest - first;
  const trend = delta > 0 ? `up ${delta}` : delta < 0 ? `down ${Math.abs(delta)}` : 'unchanged';
  return `Current reputation score is ${latest}, ${trend} across ${points.length} data points.`;
}

/** #262 — reputation score trend over time. */
export default function ReputationHistoryScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [points, setPoints] = useState<ReputationHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const history = await reputationApi.getMyReputationHistory();
      setPoints(
        [...history].sort(
          (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
        ),
      );
    } catch (err: unknown) {
      setError((err as Error)?.message ?? 'Failed to load reputation history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const maxScore = useMemo(() => Math.max(1, ...points.map((p) => p.score)), [points]);
  const summary = summarizeReputation(points);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button">
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reputation History</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color="#2d6a2d" testID="reputation-loading" />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => void load()} accessibilityRole="button">
            <Text style={styles.retry}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.summary} testID="reputation-summary">
            {summary}
          </Text>
          {points.length > 0 ? (
            <View
              style={styles.chart}
              testID="reputation-chart"
              accessible
              accessibilityLabel={summary}
            >
              {points.map((p) => (
                <View
                  key={p.recordedAt}
                  style={[
                    styles.bar,
                    { height: Math.max(4, (p.score / maxScore) * CHART_HEIGHT) },
                  ]}
                />
              ))}
            </View>
          ) : null}
          {points
            .slice()
            .reverse()
            .map((p) => (
              <View key={`row-${p.recordedAt}`} style={styles.row}>
                <Text style={styles.rowDate}>{new Date(p.recordedAt).toLocaleDateString()}</Text>
                <Text style={styles.rowScore}>{p.score}</Text>
              </View>
            ))}
        </ScrollView>
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
  center: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  content: { padding: 16, gap: 8 },
  summary: { fontSize: 14, color: '#374151', fontWeight: '600', marginBottom: 8 },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: CHART_HEIGHT,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
  },
  bar: { flex: 1, maxWidth: 24, backgroundColor: '#2d6a2d', borderRadius: 3 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
  },
  rowDate: { fontSize: 13, color: '#6b7280' },
  rowScore: { fontSize: 14, fontWeight: '700', color: '#1a3a1a' },
  errorText: { color: '#b91c1c', fontSize: 14 },
  retry: { color: '#2d6a2d', fontWeight: '600' },
});
