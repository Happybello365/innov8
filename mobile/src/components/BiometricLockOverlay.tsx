import { StyleSheet, Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import { getTheme } from '../constants/theme';

/** Full-screen cover shown while the app is biometric-locked (issue #258). */
export function BiometricLockOverlay({ onUnlock }: { onUnlock: () => void }) {
  const theme = getTheme(useColorScheme());

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.container, { backgroundColor: theme.background }]}
      accessibilityViewIsModal
      testID="biometric-lock-overlay"
    >
      <Text style={[styles.title, { color: theme.textPrimary }]}>Amana is locked</Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Confirm it's you to continue.
      </Text>
      <TouchableOpacity
        style={[styles.button, { backgroundColor: theme.primary }]}
        onPress={onUnlock}
        accessibilityRole="button"
        accessibilityLabel="Unlock"
      >
        <Text style={[styles.buttonText, { color: theme.primaryText }]}>Unlock</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 15, marginBottom: 24 },
  button: { paddingVertical: 14, paddingHorizontal: 40, borderRadius: 10 },
  buttonText: { fontSize: 16, fontWeight: '600' },
});
