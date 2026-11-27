import { lazy, Suspense, useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import type { NavigationContainerRef } from '@react-navigation/native';
import { ActivityIndicator, Linking, View } from 'react-native';

import type { RootStackParamList } from '../types/navigation';
import WalletConnectScreen from '../screens/WalletConnectScreen';
import TradeListScreen from '../screens/TradeListScreen';
import TradeDetailScreen from '../screens/TradeDetailScreen';
import DisputeDetailScreen from '../screens/DisputeDetailScreen';
import CreateTradeScreen from '../screens/CreateTradeScreen';
import EvidenceCaptureScreen from '../screens/EvidenceCaptureScreen';
import VaultDashboard from '../screens/VaultDashboard';
import GoalContributionHistoryScreen from '../screens/GoalContributionHistoryScreen';
import ReputationHistoryScreen from '../screens/ReputationHistoryScreen';
import NotificationsInboxScreen from '../screens/NotificationsInboxScreen';
import AboutScreen from '../screens/AboutScreen';
import NotificationPreferencesScreen from '../screens/NotificationPreferencesScreen';
import SecuritySettingsScreen from '../screens/SecuritySettingsScreen';
import { useDeepLink } from '../hooks/useDeepLink';
import {
  getInitialNotificationData,
  setupNotificationListeners,
} from '../services/notification.service';
import { targetForNotification } from '../services/notificationRouting';

// Admin screens are lazy-loaded and only registered for admin users (issue #100).
// This keeps the initial JS bundle smaller for the vast majority of users who
// never access the admin area.
const AdminStreamsOverviewScreen = lazy(
  () => import('../screens/AdminStreamsOverviewScreen'),
);
const AdminTradesBatchScreen = lazy(
  () => import('../screens/AdminTradesBatchScreen'),
);
const AdminContractScreen = lazy(
  () => import('../screens/AdminContractScreen'),
);
const AdminFeaturesScreen = lazy(
  () => import('../screens/AdminFeaturesScreen'),
);
const AdminActionSuccessScreen = lazy(
  () => import('../screens/AdminActionSuccessScreen'),
);
const Stack = createStackNavigator<RootStackParamList>();

interface AppNavigatorProps {
  isAuthenticated: boolean;
  /** When true the admin screen stack is registered and lazy-loaded (issue #100). */
  isAdmin?: boolean;
}

export function AppNavigator({ isAuthenticated, isAdmin = false }: AppNavigatorProps) {
  const { handleUrl, handleDeepLink, resumePendingDeepLink } = useDeepLink();
  const navRef = useRef<NavigationContainerRef<RootStackParamList> | null>(null);

  // Cold start: route (or park) the URL the app was opened with.
  useEffect(() => {
    let active = true;
    void Linking.getInitialURL().then((url) => {
      if (active) handleUrl(url, navRef.current);
    }).catch(() => undefined);
    // Warm start: route links received while the app is running.
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url, navRef.current));
    return () => {
      active = false;
      sub.remove();
    };
  }, [handleUrl]);

  // Push notification taps (issue #259): open the trade the push is about,
  // or fall back to home when the payload has no usable trade id. Routed
  // through useDeepLink so a tap while signed out is parked until login.
  useEffect(() => {
    let cancelled = false;
    getInitialNotificationData().then((data) => {
      if (!cancelled && data) handleDeepLink(targetForNotification(data), navRef.current);
    });
    const unsubscribe = setupNotificationListeners((data) =>
      handleDeepLink(targetForNotification(data), navRef.current),
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [handleDeepLink]);

  // Login-then-continue: replay a parked link once authenticated.
  useEffect(() => {
    if (isAuthenticated) {
      resumePendingDeepLink(navRef.current);
    }
  }, [isAuthenticated, resumePendingDeepLink]);

  return (
    <NavigationContainer
      ref={navRef}
      fallback={null}
      onReady={() => {
        resumePendingDeepLink(navRef.current);
      }}
    >
      <Stack.Navigator
        initialRouteName={isAuthenticated ? 'TradeList' : 'WalletConnect'}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="WalletConnect" component={WalletConnectScreen} />
        <Stack.Screen name="TradeList" component={TradeListScreen} />
        <Stack.Screen name="TradeDetail" component={TradeDetailScreen} />
        <Stack.Screen name="DisputeDetail" component={DisputeDetailScreen} />
        <Stack.Screen name="CreateTrade" component={CreateTradeScreen} />
        <Stack.Screen name="EvidenceCapture" component={EvidenceCaptureScreen} />
        <Stack.Screen name="VaultDashboard" component={VaultDashboard} />
        <Stack.Screen name="GoalContributionHistory" component={GoalContributionHistoryScreen} />
        <Stack.Screen name="ReputationHistory" component={ReputationHistoryScreen} />
        {isAdmin && (
          <Suspense
            fallback={
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#2d6a2d" />
              </View>
            }
          >
            <Stack.Screen name="AdminStreamsOverview" component={AdminStreamsOverviewScreen} />
            <Stack.Screen name="AdminTradesBatch" component={AdminTradesBatchScreen} />
            <Stack.Screen name="AdminContract" component={AdminContractScreen} />
            <Stack.Screen name="AdminFeatures" component={AdminFeaturesScreen} />
            <Stack.Screen name="AdminActionSuccess" component={AdminActionSuccessScreen} />
          </Suspense>
        )}
        <Stack.Screen name="NotificationsInbox" component={NotificationsInboxScreen} />
        <Stack.Screen name="About" component={AboutScreen} />
        <Stack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} />
        <Stack.Screen name="SecuritySettings" component={SecuritySettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
