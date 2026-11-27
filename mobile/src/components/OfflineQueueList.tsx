import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { QueuedAction, QueuedActionStatus } from '../stores/offlineQueueStore';

interface OfflineQueueListProps {
  actions: QueuedAction[];
  onRetry: (id: string) => void;
}

const STATUS_LABEL: Record<QueuedActionStatus, string> = {
  pending: 'Pending',
  succeeded: 'Sent',
  failed: 'Failed',
};

const STATUS_STYLE: Record<QueuedActionStatus, { color: string }> = {
  pending: { color: '#7a4d00' },
  succeeded: { color: '#065f46' },
  failed: { color: '#b91c1c' },
};

/**
 * Per-action status list for actions queued while offline (#263). Purely
 * presentational: a failed item exposes its own Retry button so the user can
 * resend it without replaying the whole queue.
 */
export function OfflineQueueList({ actions, onRetry }: OfflineQueueListProps): React.JSX.Element | null {
  if (actions.length === 0) return null;

  return (
    <View style={styles.list} testID="offline-queue-list">
      {actions.map((action) => (
        <View key={action.id} style={styles.row} testID={`queued-action-${action.id}`}>
          <View style={styles.text}>
            <Text style={styles.label}>{action.label}</Text>
            {action.status === 'failed' && action.error ? (
              <Text style={styles.error}>{action.error}</Text>
            ) : null}
          </View>
          <Text
            style={[styles.status, STATUS_STYLE[action.status]]}
            accessibilityLabel={`${action.label}: ${STATUS_LABEL[action.status]}`}
          >
            {STATUS_LABEL[action.status]}
          </Text>
          {action.status === 'failed' ? (
            <TouchableOpacity
              onPress={() => onRetry(action.id)}
              accessibilityRole="button"
              accessibilityLabel={`Retry ${action.label}`}
              style={styles.retryBtn}
              testID={`retry-${action.id}`}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: 6, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  text: { flex: 1 },
  label: { fontSize: 13, color: '#7a4d00' },
  error: { fontSize: 11, color: '#b91c1c' },
  status: { fontSize: 12, fontWeight: '700' },
  retryBtn: {
    borderWidth: 1,
    borderColor: '#b91c1c',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  retryText: { fontSize: 12, fontWeight: '600', color: '#b91c1c' },
});
