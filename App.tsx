import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Navigation } from './src/navigation';
import { PermissionGate } from './src/components/PermissionGate';
import { RidesProvider } from './src/hooks/useRides';
import { SegmentMarkerRasterProvider } from './src/components/map/SegmentMarkerRasterProvider';

import './src/tasks/locationTask';

export default function App() {
  return (
    <SafeAreaProvider>
      <PermissionGate>
        <SegmentMarkerRasterProvider>
          <RidesProvider>
            <Navigation />
          </RidesProvider>
        </SegmentMarkerRasterProvider>
      </PermissionGate>
      <StatusBar style="auto" translucent={false} />
    </SafeAreaProvider>
  );
}
