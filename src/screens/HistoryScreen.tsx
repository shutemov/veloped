import React, { useCallback, useLayoutEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useRides } from '../hooks/useRides';
import { HistoryScreenProvider, useHistoryScreenContext } from '../context/HistoryScreenContext';
import { ShareGpxHeaderButton } from '../components/ShareGpxHeaderButton';
import { shareRidesAsGpx, ShareGpxError } from '../utils/shareAllRidesGpx';
import { HistoryTopTabs } from './history/HistoryTopTabs';
import type { Ride } from '../types';

type HistoryStackParamList = {
  HistoryList: undefined;
  RideDetail: { rideId: string };
};

type NavigationProp = NativeStackNavigationProp<HistoryStackParamList, 'HistoryList'>;

function HistoryScreenShell() {
  const navigation = useNavigation<NavigationProp>();
  const { recordedRides, activeTab } = useHistoryScreenContext();
  const [exporting, setExporting] = useState(false);

  const handleShareGpx = useCallback(async () => {
    if (recordedRides.length === 0) return;
    setExporting(true);
    try {
      await shareRidesAsGpx(recordedRides, {
        fileName: `veloped-my-routes-${Date.now()}.gpx`,
        dialogTitle: 'Поделиться моими маршрутами (GPX)',
      });
    } catch (error) {
      if (error instanceof ShareGpxError && error.code === 'NO_RIDES') {
        return;
      }
      const message =
        error instanceof ShareGpxError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      Alert.alert('Не удалось поделиться', message);
    } finally {
      setExporting(false);
    }
  }, [recordedRides]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight:
        activeTab === 'my'
          ? () => (
              <ShareGpxHeaderButton
                onPress={handleShareGpx}
                disabled={recordedRides.length === 0}
                loading={exporting}
                accessibilityLabel="Экспорт всех маршрутов в GPX и поделиться"
              />
            )
          : undefined,
    });
  }, [navigation, handleShareGpx, exporting, recordedRides.length, activeTab]);

  return <HistoryTopTabs />;
}

export function HistoryScreen() {
  const { rides, loading, refresh } = useRides();
  const navigation = useNavigation<NavigationProp>();

  const navigateToRideDetail = useCallback(
    (ride: Ride) => {
      navigation.navigate('RideDetail', { rideId: ride.id });
    },
    [navigation]
  );

  return (
    <HistoryScreenProvider
      rides={rides}
      loading={loading}
      refresh={refresh}
      navigateToRideDetail={navigateToRideDetail}
    >
      <HistoryScreenShell />
    </HistoryScreenProvider>
  );
}
