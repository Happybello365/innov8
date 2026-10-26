import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { StackScreenProps } from '@react-navigation/stack';
import type { RootStackParamList } from '../types/navigation';
import {
  DEFAULT_BIOMETRIC_LOCK_SETTINGS,
  IDLE_TIMEOUT_OPTIONS_MS,
  getBiometricLockSettings,
  isBiometricAvailable,
  saveBiometricLockSettings,
  type BiometricLockSettings,
} from '../services/biometricLock.service';
import { getTheme } from '../constants/theme';

type Props = StackScreenProps<RootStackParamList, 'SecuritySettings'>;

function timeoutLabel(ms: number): string {
  if (ms === 0) return 'Immediately';
  return ms < 60_000 ? `${ms / 1000} sec` : `${ms / 60_000} min`;
}

/** Biometric lock on resume settings (issue #258). */
export default function SecuritySettingsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const theme = getTheme(useColorScheme());
  const [settings, setSettings] = useState<BiometricLockSettings>(DEFAULT_BIOMETRIC_LOCK_SETTINGS);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    getBiometricLockSettings().then(setSettings);
    isBiometricAvailable().then(setAvailable);
  }, []);

  const update = (next: BiometricLockSettings) => {
    setSettings(next);
    saveBiometricLockSettings(next).catch(() => undefined);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.backBtn, { color: theme.primary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.textPrimary }]}>Security</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
          <View style={styles.row}>
            <Text style={[styles.label, { color: theme.textPrimary }]}>Biometric lock on resume</Text>
            <Switch
              value={settings.enabled}
              onValueChange={(enabled) => update({ ...settings, enabled })}
              disabled={available === false}
              accessibilityLabel="Enable biometric lock"
              testID="biometric-lock-toggle"
            />
          </View>
          {available === false && (
            <Text style={[styles.hint, { color: theme.textMuted }]}>
              No Face ID / Touch ID is set up on this device, so your wallet sign-in is used instead.
            </Text>
          )}
        </View>

        {settings.enabled && (
          <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Lock after</Text>
            {IDLE_TIMEOUT_OPTIONS_MS.map((ms) => (
              <TouchableOpacity
                key={ms}
                style={styles.row}
                onPress={() => update({ ...settings, idleTimeoutMs: ms })}
                accessibilityRole="radio"
                accessibilityState={{ selected: settings.idleTimeoutMs === ms }}
              >
                <Text style={[styles.label, { color: theme.textPrimary }]}>{timeoutLabel(ms)}</Text>
                {settings.idleTimeoutMs === ms && <Text style={{ color: theme.primary }}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
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
  content: { padding: 16, gap: 16 },
  card: { borderRadius: 12, borderWidth: 1, paddingVertical: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  label: { fontSize: 15, flex: 1 },
  sectionTitle: { fontSize: 13, fontWeight: '600', paddingHorizontal: 16, paddingTop: 10 },
  hint: { fontSize: 12, paddingHorizontal: 16, paddingBottom: 12 },
});
