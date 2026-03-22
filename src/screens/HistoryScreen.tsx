import React, { useCallback, useLayoutEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useRides } from '../hooks/useRides';
import { HistoryScreenProvider, useHistoryScreenContext } from '../context/HistoryScreenContext';
import { ShareGpxHeaderButton } from '../components/ShareGpxHeaderButton';
import { ImportGpxHeaderButton } from '../components/ImportGpxHeaderButton';
import { shareAllRidesAsGpx, ShareGpxError } from '../utils/shareAllRidesGpx';
import { GpxImportError, parseImportedGpx } from '../utils/parseImportedGpx';
import { HistoryTopTabs } from './history/HistoryTopTabs';
import type { Ride } from '../types';

type HistoryStackParamList = {
  HistoryList: undefined;
  RideDetail: { rideId: string };
};

type NavigationProp = NativeStackNavigationProp<HistoryStackParamList, 'HistoryList'>;

function HistoryScreenShell() {
  const navigation = useNavigation<NavigationProp>();
  const { recordedRides, activeTab, importRides, switchToImportedTab } =
    useHistoryScreenContext();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleShareGpx = useCallback(async () => {
    if (recordedRides.length === 0) return;
    setExporting(true);
    try {
      await shareAllRidesAsGpx(recordedRides);
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

  const handleImportGpx = useCallback(async () => {
    setImporting(true);
    try {
      const pick = await DocumentPicker.getDocumentAsync({
        type: ['application/gpx+xml', 'application/xml', 'text/xml', '*/*'],
        copyToCacheDirectory: true,
      });
      if (pick.canceled || !pick.assets?.[0]) {
        return;
      }
      const asset = pick.assets[0];
      const xml = await FileSystem.readAsStringAsync(asset.uri);
      const importBatchId = Crypto.randomUUID();
      const importedAt = Date.now();
      const parsed = parseImportedGpx(xml, {
        importBatchId,
        importedAt,
        fileLabel: asset.name ?? undefined,
      });
      await importRides(parsed);
      switchToImportedTab();
      Alert.alert('Готово', `Добавлено маршрутов: ${parsed.length}`);
    } catch (error) {
      if (error instanceof GpxImportError) {
        Alert.alert('Импорт GPX', error.message);
        return;
      }
      const message =
        error instanceof Error ? error.message : String(error);
      Alert.alert('Импорт GPX', message);
    } finally {
      setImporting(false);
    }
  }, [importRides, switchToImportedTab]);

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
          : () => (
              <ImportGpxHeaderButton
                onPress={handleImportGpx}
                loading={importing}
                accessibilityLabel="Импорт маршрутов из файла GPX"
              />
            ),
    });
  }, [
    navigation,
    handleShareGpx,
    handleImportGpx,
    exporting,
    importing,
    recordedRides.length,
    activeTab,
  ]);

  return <HistoryTopTabs />;
}

export function HistoryScreen() {
  const { rides, loading, refresh, importRides } = useRides();
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
      importRides={importRides}
    >
      <HistoryScreenShell />
    </HistoryScreenProvider>
  );
}
