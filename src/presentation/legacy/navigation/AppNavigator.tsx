import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { StyleSheet, Text } from 'react-native';
import HomeScreen from '../screens/HomeScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SplitsScreen from '../screens/SplitsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ModelLibraryScreen from '../screens/ModelLibraryScreen';

import AccountsScreen from '../screens/AccountsScreen';

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
  return (
    <NavigationContainer>
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
