import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Button, Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { compareVersions, getCurrentVersion, loadUpdatePolicy, type UpdateInfo } from '../services/appUpdate.service';
import { UpdateBanner } from './UpdateBanner';

export function AppVersionGate({ children }: { children: ReactNode }) {
  const [policy, setPolicy] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [storeError, setStoreError] = useState(false);
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setChecking(true);
    const next = await loadUpdatePolicy();
    if (generation.current !== request) return;
    if (next) setPolicy(next);
    setChecking(false);
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      generation.current++;
      subscription.remove();
    };
  }, [refresh]);

  if (!ready) {
    return <View style={styles.screen}><ActivityIndicator accessibilityLabel="Checking app version" /></View>;
  }

  if (policy?.required) {
    const openStore = async () => {
      if (!policy.storeUrl) return;
      setStoreError(false);
      try {
        await Linking.openURL(policy.storeUrl);
      } catch {
        setStoreError(true);
      }
    };

    return (
      <SafeAreaView style={styles.screen} testID="app-version-required">
        <Text accessibilityRole="header" style={styles.title}>Update required</Text>
        <Text style={styles.message}>
          Install version {policy.minimumVersion} or newer to use trades, wallets, and other app features.
        </Text>
        {policy.storeUrl && <Button title="Update app" onPress={() => void openStore()} />}
        {(!policy.storeUrl || storeError) && (
          <Text accessibilityRole="alert" style={styles.message}>Open your app store and search for Amana Vault.</Text>
        )}
        <Button title="Check again" onPress={() => void refresh()} disabled={checking} />
      </SafeAreaView>
    );
  }

  const current = getCurrentVersion();
  return (
    <>
      {children}
      {policy && current && compareVersions(current, policy.latestVersion) < 0 && (
        <UpdateBanner update={policy} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  message: { textAlign: 'center' },
});
