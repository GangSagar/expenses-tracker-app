import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/presentation/legacy/navigation/AppNavigator';
import CategoryPopup from './src/presentation/legacy/components/CategoryPopup';
import SecurityGate from './src/presentation/legacy/components/SecurityGate';
import { useMessageListener } from './src/hooks/useMessageListener';

function AppContent() {
  useMessageListener();

  return (
    <SecurityGate>
      <AppNavigator />
      <CategoryPopup />
    </SecurityGate>
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
