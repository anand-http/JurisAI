import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FilePlus2, History, User } from 'lucide-react-native';

import { AccountScreen } from '../screens/account/AccountScreen';
import { PaywallScreen } from '../screens/account/PaywallScreen';
import { SetPasswordScreen } from '../screens/account/SetPasswordScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { OtpScreen } from '../screens/auth/OtpScreen';
import { ProfileSetupScreen } from '../screens/auth/ProfileSetupScreen';
import { CitationSourceScreen } from '../screens/draft/CitationSourceScreen';
import { DocumentTypeScreen } from '../screens/draft/DocumentTypeScreen';
import { DraftIntakeScreen } from '../screens/draft/DraftIntakeScreen';
import { DraftReviewScreen } from '../screens/draft/DraftReviewScreen';
import { ExportScreen } from '../screens/draft/ExportScreen';
import { GeneratingScreen } from '../screens/draft/GeneratingScreen';
import { HistoryScreen } from '../screens/history/HistoryScreen';
import { useAuthStore } from '../store/authStore';
import { colors } from '../theme';
import type { MainTabParamList, RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

type TabIconProps = { color: string; size: number };
const NewDraftIcon = ({ color, size }: TabIconProps) => (
  <FilePlus2 color={color} size={size} />
);
const HistoryIcon = ({ color, size }: TabIconProps) => (
  <History color={color} size={size} />
);
const AccountIcon = ({ color, size }: TabIconProps) => (
  <User color={color} size={size} />
);

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="NewDraft"
        component={DocumentTypeScreen}
        options={{
          title: 'New draft',
          tabBarIcon: NewDraftIcon,
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          title: 'My drafts',
          tabBarIcon: HistoryIcon,
        }}
      />
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{
          title: 'Account',
          tabBarIcon: AccountIcon,
        }}
      />
    </Tab.Navigator>
  );
}

/**
 * Screens are chosen by auth status, so signing in/out swaps the whole stack
 * and the back button can never return to a signed-out screen.
 */
export function RootNavigator() {
  const status = useAuthStore(s => s.status);

  if (status === 'loading') {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text, fontWeight: '600' },
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {status === 'signedOut' ? (
        <>
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Otp"
            component={OtpScreen}
            options={{ title: '' }}
          />
        </>
      ) : status === 'needsProfile' ? (
        <Stack.Screen
          name="Onboarding"
          component={ProfileSetupScreen}
          options={{ headerShown: false }}
        />
      ) : (
        <>
          <Stack.Screen
            name="Main"
            component={MainTabs}
            options={{ headerShown: false }}
          />
          <Stack.Screen name="DraftIntake" component={DraftIntakeScreen} />
          <Stack.Screen
            name="Generating"
            component={GeneratingScreen}
            options={{ headerShown: false, gestureEnabled: false }}
          />
          <Stack.Screen
            name="DraftReview"
            component={DraftReviewScreen}
            options={{ title: 'Draft' }}
          />
          <Stack.Screen
            name="EditProfile"
            component={ProfileSetupScreen}
            options={{ title: 'Edit profile' }}
          />
          <Stack.Screen
            name="SetPassword"
            component={SetPasswordScreen}
            options={{ title: 'Password' }}
          />
          <Stack.Group screenOptions={{ presentation: 'modal' }}>
            <Stack.Screen
              name="CitationSource"
              component={CitationSourceScreen}
            />
            <Stack.Screen
              name="Export"
              component={ExportScreen}
              options={{ title: 'Export' }}
            />
            <Stack.Screen
              name="Paywall"
              component={PaywallScreen}
              options={{ title: '' }}
            />
          </Stack.Group>
        </>
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
