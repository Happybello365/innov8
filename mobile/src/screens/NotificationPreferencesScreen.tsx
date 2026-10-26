import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../types/navigation';
import { quietHoursApi } from '../api/notifications';
import { getDeviceTimeZone } from '../services/notification.service';
import { getTheme } from '../constants/theme';

type Props = StackScreenProps<RootStackParamList, 'NotificationPreferences'>;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidQuietHoursTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/** Notification preferences: quiet-hours range (issue #260). */
export default function NotificationPreferencesScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const theme = getTheme(useColorScheme());
  const timezone = getDeviceTimeZone();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [start, setStart] = useState('22:00');
  const [end, setEnd] = useState('07:00');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    quietHoursApi
      .getQuietHours()
      .then((qh) => {
        if (!qh) return;
        setEnabled(qh.enabled);
        setStart(qh.start);
        setEnd(qh.end);
      })
      .catch(() => setMessage('Could not load quiet hours.'))
      .finally(() => setLoading(false));
  }, []);

  const valid = isValidQuietHoursTime(start) && isValidQuietHoursTime(end) && start !== end;

  const handleSave = async () => {
    if (!valid) {
      setMessage('Enter times as HH:MM (24-hour); start and end must differ.');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const saved = await quietHoursApi.updateQuietHours({ enabled, start, end, timezone });
      setEnabled(saved.enabled);
      setStart(saved.start);
      setEnd(saved.end);
      setMessage('Quiet hours saved.');
    } catch {
      setMessage('Could not save quiet hours. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backBtn, { color: theme.primary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Notification Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={theme.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
            <View style={styles.row}>
              <Text style={[styles.label, { color: theme.textPrimary }]}>Quiet hours</Text>
              <Switch
                value={enabled}
                onValueChange={setEnabled}
                accessibilityLabel="Enable quiet hours"
                testID="quiet-hours-toggle"
              />
            </View>
            <View style={styles.row}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>From</Text>
              <TextInput
                value={start}
                onChangeText={setStart}
                editable={enabled}
                placeholder="22:00"
                maxLength={5}
                keyboardType="numbers-and-punctuation"
                accessibilityLabel="Quiet hours start"
                testID="quiet-hours-start"
                style={[styles.input, { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.inputBg }]}
              />
            </View>
            <View style={styles.row}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>To</Text>
              <TextInput
                value={end}
                onChangeText={setEnd}
                editable={enabled}
                placeholder="07:00"
                maxLength={5}
                keyboardType="numbers-and-punctuation"
                accessibilityLabel="Quiet hours end"
                testID="quiet-hours-end"
                style={[styles.input, { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.inputBg }]}
              />
            </View>
            <Text style={[styles.timezone, { color: theme.textMuted }]} testID="quiet-hours-timezone">
              Times are in your device timezone: {timezone}
            </Text>
          </View>

          {message && <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>}

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]}
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Save quiet hours"
          >
            <Text style={[styles.saveBtnText, { color: theme.primaryText }]}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: { fontSize: 14, fontWeight: '500' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  loader: { marginTop: 40 },
  content: { padding: 16, gap: 16 },
  card: { borderRadius: 12, borderWidth: 1, paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  label: { fontSize: 15 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, minWidth: 80, textAlign: 'center' },
  timezone: { fontSize: 12, paddingHorizontal: 16, paddingBottom: 12 },
  message: { fontSize: 14, textAlign: 'center' },
  saveBtn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: '600' },
});
