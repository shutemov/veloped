import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Navigation } from './src/navigation';
import { PermissionGate } from './src/components/PermissionGate';

import './src/tasks/locationTask';

export default function App() {
  return (
    <SafeAreaProvider>
      <PermissionGate>
        <Navigation />
      </PermissionGate>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
