import React, { useEffect } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { StyleSheet, Text, NativeModules, AppState, NativeEventEmitter } from 'react-native';
import HomeScreen from '../screens/HomeScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SplitsScreen from '../screens/SplitsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ModelLibraryScreen from '../screens/ModelLibraryScreen';
import AccountsScreen from '../screens/AccountsScreen';
import { useExpenseStore } from '../../../hooks/useExpenses';

export const navigationRef = createNavigationContainerRef<any>();

const Tab = createMaterialTopTabNavigator();
const styles = StyleSheet.create({ icon: { fontSize: 20 } });
const makeTabIcon = (glyph: string) => ({ color }: { color: string }) => (
  <Text style={[styles.icon, { color }]}>{glyph}</Text>
);
const tabIcons = {
  home: makeTabIcon('🏠'),
  history: makeTabIcon('📋'),
  splits: makeTabIcon('👥'),
  accounts: makeTabIcon('💳'),
  settings: makeTabIcon('⚙️'),
  models: makeTabIcon('🧠'),
};

export default function AppNavigator() {
  useEffect(() => {
    const handleNotificationAction = (res: any) => {
      if (!res?.action || !navigationRef.isReady()) return;
      if (res.action === 'VIEW_TRANSACTION' && res.transactionId) {
        navigationRef.navigate('History', { transactionId: res.transactionId });
      } else if (res.action === 'REVIEW_TRANSACTION' && res.candidateJson) {
        try {
          const candidate = JSON.parse(res.candidateJson);
          useExpenseStore.getState().queuePendingExpense(candidate);
        } catch (e) {
          console.warn('Failed to parse candidate JSON for review', e);
        }
      } else if (res.action === 'VIEW_ANALYTICS' || res.action === 'VIEW_REPORT') {
        navigationRef.navigate('Home');
      } else if (res.action === 'VIEW_HISTORY') {
        navigationRef.navigate('History');
      } else if (res.action === 'VIEW_ALERT') {
        if (res.alertType === 'duplicate') {
          navigationRef.navigate('History');
        } else {
          navigationRef.navigate('Home');
        }
      }
    };

    const checkNotificationAction = async () => {
      try {
        const { MessageModule } = NativeModules;
        if (typeof MessageModule?.getInitialNotificationAction === 'function') {
          const res = await MessageModule.getInitialNotificationAction();
          handleNotificationAction(res);
        }
      } catch {
        // best effort check
      }
    };

    checkNotificationAction();

    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        checkNotificationAction();
      }
    });

    const eventEmitter = NativeModules.MessageModule ? new NativeEventEmitter(NativeModules.MessageModule) : null;
    const actionSub = eventEmitter?.addListener('onNotificationAction', handleNotificationAction);

    return () => {
      sub.remove();
      actionSub?.remove();
    };
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <Tab.Navigator
        tabBarPosition="bottom"
        screenOptions={{
          tabBarActiveTintColor: '#1a73e8',
          tabBarInactiveTintColor: '#999',
          tabBarShowIcon: true,
          tabBarShowLabel: true,
          tabBarLabelStyle: { 
            fontSize: 12, 
            textTransform: 'none',
            marginTop: 0,
          },
          tabBarIndicatorStyle: {
            backgroundColor: '#1a73e8',
            top: 0, // Indicator at the top of the bottom bar
          },
          tabBarStyle: {
            height: 60,
            justifyContent: 'center',
          },
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarIcon: tabIcons.home,
          }}
        />
        <Tab.Screen
          name="History"
          component={HistoryScreen}
          options={{
            tabBarIcon: tabIcons.history,
          }}
        />
        <Tab.Screen
          name="Splits"
          component={SplitsScreen}
          options={{
            tabBarIcon: tabIcons.splits,
          }}
        />
        <Tab.Screen
          name="Accounts"
          component={AccountsScreen}
          options={{
            tabBarIcon: tabIcons.accounts,
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarIcon: tabIcons.settings,
          }}
        />
        <Tab.Screen
          name="Models"
          component={ModelLibraryScreen}
          options={{
            tabBarIcon: tabIcons.models,
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
