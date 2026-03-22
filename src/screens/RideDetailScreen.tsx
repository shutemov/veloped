import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  Pressable,
  ActivityIndicator,
  InteractionManager,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OSMView, OSMViewRef } from 'expo-osm-sdk';
import { useRides } from '../hooks/useRides';
import { ShareGpxHeaderButton } from '../components/ShareGpxHeaderButton';
import { formatDate, formatTime, formatDistance, formatDuration } from '../utils/formatters';
import { shareSingleRideAsGpx, ShareGpxError } from '../utils/shareAllRidesGpx';
import { importKindLabel, isImportedRide } from '../utils/rideSource';
import {
  prepareRideRouteGeometry,
  RIDE_ROUTE_HEAVY_POINT_THRESHOLD,
  type PreparedRouteGeometry,
} from '../utils/prepareRideRouteGeometry';

type RideDetailParams = {
  RideDetail: { rideId: string };
};

type RideDetailNavigationProp = NativeStackNavigationProp<RideDetailParams, 'RideDetail'>;

export function RideDetailScreen() {
  const route = useRoute<RouteProp<RideDetailParams, 'RideDetail'>>();
  const navigation = useNavigation<RideDetailNavigationProp>();
  const { getRide, deleteRide, loading: ridesLoading } = useRides();
  const [isPointsModalVisible, setIsPointsModalVisible] = React.useState(false);
  const [isMapReady, setIsMapReady] = React.useState(false);
  const [exportingGpx, setExportingGpx] = useState(false);
  const [routeGeometry, setRouteGeometry] = useState<PreparedRouteGeometry | null>(null);
  const mapRef = useRef<OSMViewRef>(null);

  const ride = getRide(route.params.rideId);
  const rideId = route.params.rideId;
  const coordCount = ride?.coordinates.length ?? 0;

  useLayoutEffect(() => {
    if (!ride) {
      setRouteGeometry(null);
      return;
    }
    const coords = ride.coordinates;
    if (coords.length === 0) {
      setRouteGeometry(prepareRideRouteGeometry([]));
      return;
    }
    if (coords.length < RIDE_ROUTE_HEAVY_POINT_THRESHOLD) {
      setRouteGeometry(prepareRideRouteGeometry(coords));
      return;
    }
    setRouteGeometry(null);
  }, [rideId, ride]);

  useEffect(() => {
    if (!ride || coordCount < RIDE_ROUTE_HEAVY_POINT_THRESHOLD) {
      return;
    }
    let cancelled = false;
    const coords = ride.coordinates;
    const handle = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        setRouteGeometry(prepareRideRouteGeometry(coords));
      });
    });
    return () => {
      cancelled = true;
      handle.cancel?.();
    };
  }, [rideId, ride, coordCount]);

  const normalizedCoords = routeGeometry?.normalizedCoords ?? [];
  const polylineCoords = routeGeometry?.polylineCoords ?? [];
  const routeMarkers = routeGeometry?.routeMarkers ?? [];
  const routeRegion = routeGeometry?.routeRegion ?? null;
  const routeZoom = routeGeometry?.routeZoom ?? 14;

  const isHeavyRouteLoading =
    ride != null &&
    coordCount >= RIDE_ROUTE_HEAVY_POINT_THRESHOLD &&
    routeGeometry === null;

  const focusRoute = useCallback(async () => {
    if (!isMapReady || !mapRef.current || !routeRegion) return;
    try {
      if (mapRef.current.isViewReady) {
        const viewReady = await mapRef.current.isViewReady();
        if (!viewReady) return;
      }
      await mapRef.current.animateToLocation(
        routeRegion.latitude,
        routeRegion.longitude,
        routeZoom
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('Map not ready') ||
        message.includes('style not loaded')
      ) {
        return;
      }
      console.error('Failed to focus route on map:', error);
    }
  }, [isMapReady, routeRegion, routeZoom]);

  useEffect(() => {
    void focusRoute();
  }, [focusRoute]);

  // expo-osm-sdk (Android): setPolylines вызывается до готовности MapLibre — линии не рисуются и больше не применяются.
  // Сбрасываем флаг при смене поездки и отдаём overlays только после onMapReady.
  useEffect(() => {
    setIsMapReady(false);
  }, [route.params.rideId]);

  const handleShareGpx = useCallback(async () => {
    if (!ride) return;
    setExportingGpx(true);
    try {
      await shareSingleRideAsGpx(ride);
    } catch (error) {
      const message =
        error instanceof ShareGpxError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      Alert.alert('Не удалось поделиться', message);
    } finally {
      setExportingGpx(false);
    }
  }, [ride]);

  useLayoutEffect(() => {
    if (!ride) {
      navigation.setOptions({ headerRight: undefined });
      return;
    }
    navigation.setOptions({
      headerRight: () => (
        <ShareGpxHeaderButton
          onPress={handleShareGpx}
          loading={exportingGpx}
          accessibilityLabel="Экспорт этой поездки в GPX и поделиться"
        />
      ),
    });
  }, [navigation, ride, handleShareGpx, exportingGpx]);

  const handleDelete = () => {
    if (!ride) return;
    Alert.alert(
      'Удалить поездку?',
      'Это действие нельзя отменить.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            await deleteRide(ride.id);
            navigation.goBack();
          },
        },
      ]
    );
  };

  if (ridesLoading && !ride) {
    return (
      <View style={styles.errorContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  if (!ride) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Поездка не найдена</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.mapContainer}>
        {isHeavyRouteLoading ? (
          <View style={styles.routeCardLoading}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.routeCardLoadingTitle}>Готовим маршрут…</Text>
            <Text style={styles.routeCardLoadingHint}>
              {coordCount.toLocaleString('ru-RU')} точек на карте
            </Text>
          </View>
        ) : (
          <>
            <OSMView
              key={ride.id}
              ref={mapRef}
              style={styles.map}
              initialCenter={
                routeRegion
                  ? { latitude: routeRegion.latitude, longitude: routeRegion.longitude }
                  : { latitude: 55.751244, longitude: 37.618423 }
              }
              initialZoom={14}
              onMapReady={() => setIsMapReady(true)}
              markers={isMapReady ? routeMarkers : []}
              polylines={
                isMapReady && polylineCoords.length > 1
                  ? [
                      {
                        id: 'ride_route',
                        coordinates: polylineCoords,
                        strokeColor: '#4CAF50',
                        strokeWidth: 6,
                      },
                    ]
                  : []
              }
            />
            {polylineCoords.length < 2 && (
              <View style={styles.emptyRouteOverlay}>
                <Text style={styles.emptyRouteText}>Для маршрута нужно минимум 2 точки GPS</Text>
              </View>
            )}
          </>
        )}
      </View>

      <View style={styles.details}>
        <View style={styles.dateRow}>
          <Text style={styles.date}>{formatDate(ride.startTime)}</Text>
          <Text style={styles.time}>
            {formatTime(ride.startTime)} — {formatTime(ride.endTime)}
          </Text>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatDistance(ride.distanceKm)}</Text>
            <Text style={styles.statLabel}>Дистанция</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatDuration(ride.durationSeconds)}</Text>
            <Text style={styles.statLabel}>Время</Text>
          </View>
          <View style={styles.statCard}>
            <Pressable
              style={styles.pressableStat}
              onPress={() => setIsPointsModalVisible(true)}
            >
              <Text style={styles.statValue}>{ride.coordinates.length}</Text>
              <Text style={styles.statLabel}>Точек GPS (нажмите)</Text>
            </Pressable>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {ride.durationSeconds > 0
                ? ((ride.distanceKm / ride.durationSeconds) * 3600).toFixed(1)
                : '0'}
            </Text>
            <Text style={styles.statLabel}>Ср. скорость, км/ч</Text>
          </View>
        </View>

        {isImportedRide(ride) && (
          <View style={styles.sourceBlock}>
            <Text style={styles.sourceTitle}>Источник</Text>
            <View style={styles.sourceRow}>
              <Text style={styles.sourceLabel}>Приложение</Text>
              <Text style={styles.sourceValue}>
                {ride.sourceAppName?.trim() || 'Неизвестно'}
              </Text>
            </View>
            <View style={styles.sourceRow}>
              <Text style={styles.sourceLabel}>Устройство</Text>
              <Text style={styles.sourceValue}>
                {ride.sourceDeviceLabel?.trim() || 'Неизвестное устройство'}
              </Text>
            </View>
            <View style={styles.sourceRow}>
              <Text style={styles.sourceLabel}>Импортировано</Text>
              <Text style={styles.sourceValue}>
                {ride.importedAt != null && Number.isFinite(ride.importedAt)
                  ? `${formatDate(ride.importedAt)} ${formatTime(ride.importedAt)}`
                  : '—'}
              </Text>
            </View>
            <View style={styles.sourceRow}>
              <Text style={styles.sourceLabel}>Тип</Text>
              <Text style={styles.sourceValue}>{importKindLabel(ride.importKind)}</Text>
            </View>
            {ride.importBatchId ? (
              <View style={styles.sourceRow}>
                <Text style={styles.sourceLabel}>Пакет</Text>
                <Text style={styles.sourceValue} numberOfLines={2}>
                  {ride.importBatchId}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        <Text style={styles.deleteButton} onPress={handleDelete}>
          Удалить поездку
        </Text>
      </View>

      <Modal
        visible={isPointsModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsPointsModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Точки маршрута</Text>
            <ScrollView style={styles.pointsList}>
              {normalizedCoords.map((point, index) => (
                <View key={`${point.originalIndex}-${index}`} style={styles.pointRow}>
                  <Text style={styles.pointIndex}>#{index + 1}</Text>
                  <View style={styles.pointMeta}>
                    <Text style={styles.pointText}>lat: {point.latitude.toFixed(6)}</Text>
                    <Text style={styles.pointText}>lon: {point.longitude.toFixed(6)}</Text>
                    <Text style={styles.pointTime}>
                      {Number.isFinite(point.timestamp) ? formatTime(point.timestamp) : 'время недоступно'}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
            <Pressable
              style={styles.closeButton}
              onPress={() => setIsPointsModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>Закрыть</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  mapContainer: {
    height: 250,
    backgroundColor: '#e0e0e0',
  },
  routeCardLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#eceff1',
  },
  routeCardLoadingTitle: {
    marginTop: 14,
    fontSize: 15,
    fontWeight: '600',
    color: '#37474f',
  },
  routeCardLoadingHint: {
    marginTop: 6,
    fontSize: 13,
    color: '#78909c',
  },
  map: {
    flex: 1,
  },
  emptyRouteOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  emptyRouteText: {
    fontSize: 13,
    color: '#666',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  details: {
    padding: 16,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  date: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  time: {
    fontSize: 14,
    color: '#666',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  statCard: {
    width: '50%',
    padding: 8,
  },
  pressableStat: {
    borderRadius: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#4CAF50',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  sourceBlock: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  sourceTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  sourceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  sourceLabel: {
    fontSize: 13,
    color: '#888',
    flexShrink: 0,
  },
  sourceValue: {
    fontSize: 13,
    color: '#1a1a1a',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  deleteButton: {
    color: '#f44336',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 24,
    padding: 12,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '75%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  pointsList: {
    maxHeight: 420,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  pointIndex: {
    width: 44,
    fontWeight: '700',
    color: '#4CAF50',
  },
  pointMeta: {
    flex: 1,
  },
  pointText: {
    fontSize: 14,
    color: '#1a1a1a',
  },
  pointTime: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },
  closeButton: {
    marginTop: 12,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});
