import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  checkForUpdate,
  dismissUpdateForSession,
  isUpdateDismissed,
  type UpdateInfo,
} from '../services/appUpdate.service';

/**
 * Dismissible "new version available" banner (issue #266). Checks once on
 * mount; once dismissed it stays hidden for the rest of the session.
 */
export function UpdateBanner(): React.JSX.Element | null {
  const insets = useSafeAreaInsets();
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    if (isUpdateDismissed()) return;
    let cancelled = false;
    void checkForUpdate().then((info) => {
      if (!cancelled && !isUpdateDismissed()) setUpdate(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!update) return null;

  const dismiss = () => {
    dismissUpdateForSession();
    setUpdate(null);
  };

  return (
    <View
      style={[styles.banner, { top: insets.top + 8 }]}
      accessibilityRole="alert"
      testID="update-banner"
    >
      <Text style={styles.text}>Version {update.latestVersion} is available.</Text>
      <View style={styles.actions}>
        {update.storeUrl ? (
          <TouchableOpacity onPress={() => void Linking.openURL(update.storeUrl!)} testID="update-banner-open">
            <Text style={styles.action}>Update</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={dismiss} testID="update-banner-dismiss" accessibilityLabel="Dismiss update banner">
          <Text style={styles.dismiss}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a3a1a',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    elevation: 4,
    zIndex: 10,
  },
  text: { color: '#fff', fontSize: 13, fontWeight: '600', flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginLeft: 12 },
  action: { color: '#8fd18f', fontSize: 13, fontWeight: '700' },
  dismiss: { color: '#fff', fontSize: 14 },
});
