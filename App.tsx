import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import CategoryPopup from './src/components/CategoryPopup';
import { useMessageListener } from './src/hooks/useMessageListener';

function AppContent() {
  useMessageListener();

  return (
    <>
      <AppNavigator />
      <CategoryPopup />
    </>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor="#1a73e8" />
      <AppContent />
    </SafeAreaProvider>
  );
}

export default App;
