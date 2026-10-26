import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, View, useColorScheme } from 'react-native';

import { useAuthStore } from './stores/authStore';
import {
  registerForPushNotifications,
  storePushTokenOnBackend,
  checkNotificationPermissions,
} from './services/notification.service';
import { AppNavigator } from './navigation/AppNavigator';
import { BiometricLockOverlay } from './components/BiometricLockOverlay';
import { useBiometricLock } from './hooks/useBiometricLock';

export default function App() {
  const scheme = useColorScheme();
  const { getToken, token, isAdmin } = useAuthStore();
  const [bootstrapped, setBootstrapped] = useState(false);
  // Optional biometric re-auth on resume (issue #258); inert when signed out.
  const { locked, unlock } = useBiometricLock(!!token);

  useEffect(() => {
    getToken().finally(() => setBootstrapped(true));
  }, [getToken]);

  useEffect(() => {
    if (!token) return;

    const setupNotifications = async () => {
      const hasPermission = await checkNotificationPermissions();
      if (!hasPermission) return;

      const pushToken = await registerForPushNotifications();
      if (pushToken) {
        await storePushTokenOnBackend(pushToken, token);
      }
    };

    // Notification taps are routed inside AppNavigator, which owns the
    // navigation ref (issue #259).
    setupNotifications();
  }, [token]);

  const isDark = scheme === 'dark';

  if (!bootstrapped) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: isDark ? '#0f1f0f' : '#f0f4f0' }}>
        <ActivityIndicator size="large" color={isDark ? '#4caf50' : '#2d6a2d'} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppNavigator isAuthenticated={!!token} isAdmin={isAdmin} />
        {locked && <BiometricLockOverlay onUnlock={unlock} />}
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
