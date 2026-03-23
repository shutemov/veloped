import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Modal,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Slider from '@react-native-community/slider';
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
  calculateRouteFitZoom,
  RIDE_ROUTE_HEAVY_POINT_THRESHOLD,
  type PreparedRouteGeometry,
} from '../utils/prepareRideRouteGeometry';
import { RideDetailInfoSheet } from '../components/RideDetailInfoSheet';

type RideDetailParams = {
  RideDetail: { rideId: string };
};

type RideDetailNavigationProp = NativeStackNavigationProp<RideDetailParams, 'RideDetail'>;
const DETAIL_SLIDER_DEBOUNCE_MS = 120;
const RIDE_POLYLINE_ID = 'ride_route';

export function RideDetailScreen() {
  const { height: windowHeight } = useWindowDimensions();
  const route = useRoute<RouteProp<RideDetailParams, 'RideDetail'>>();
  const navigation = useNavigation<RideDetailNavigationProp>();
  const { getRide, deleteRide, loading: ridesLoading } = useRides();
  const [isPointsModalVisible, setIsPointsModalVisible] = React.useState(false);
  const [isMapReady, setIsMapReady] = React.useState(false);
  const [exportingGpx, setExportingGpx] = React.useState(false);
  const [detailStep, setDetailStep] = React.useState(1);
  const [detailStepInput, setDetailStepInput] = React.useState(1);
  const [routeGeometry, setRouteGeometry] = React.useState<PreparedRouteGeometry | null>(null);
  const [mapViewport, setMapViewport] = React.useState<{ width: number; height: number } | null>(
    null
  );
  const mapRef = React.useRef<OSMViewRef>(null);

  const ride = getRide(route.params.rideId);
  const rideId = route.params.rideId;
  const coordCount = ride?.coordinates.length ?? 0;
  const detailMaxStep = Math.max(1, Math.min(12, Math.floor(coordCount / 2)));
  const sampledCoords = React.useMemo(() => {
    if (!ride) return [];
    if (detailStep <= 1) return ride.coordinates;
    const sampled = ride.coordinates.filter((_, index) => index % detailStep === 0);
    const lastPoint = ride.coordinates[ride.coordinates.length - 1];
    if (lastPoint && sampled[sampled.length - 1] !== lastPoint) {
      sampled.push(lastPoint);
    }
    return sampled;
  }, [ride, detailStep]);
  const sampledCoordCount = sampledCoords.length;

  React.useEffect(() => {
    setDetailStep((prev) => Math.min(prev, detailMaxStep));
    setDetailStepInput((prev) => Math.min(prev, detailMaxStep));
  }, [detailMaxStep]);

  React.useEffect(() => {
    const nextStep = Math.max(1, Math.min(detailStepInput, detailMaxStep));
    const timeoutId = setTimeout(() => {
      setDetailStep(nextStep);
    }, DETAIL_SLIDER_DEBOUNCE_MS);
    return () => clearTimeout(timeoutId);
  }, [detailStepInput, detailMaxStep]);

  const handleDetailSliderChange = React.useCallback((value: number) => {
    setDetailStepInput(value);
  }, []);

  const handleDetailSliderComplete = React.useCallback(
    (value: number) => {
      const step = Math.max(1, Math.min(Math.round(value), detailMaxStep));
      setDetailStepInput(step);
      setDetailStep(step);
    },
    [detailMaxStep]
  );

  React.useLayoutEffect(() => {
    if (!ride) {
      setRouteGeometry(null);
      return;
    }
    const coords = sampledCoords;
    if (coords.length === 0) {
      setRouteGeometry(prepareRideRouteGeometry([]));
      return;
    }
    if (coords.length < RIDE_ROUTE_HEAVY_POINT_THRESHOLD) {
      setRouteGeometry(prepareRideRouteGeometry(coords));
      return;
    }
    setRouteGeometry(null);
  }, [rideId, ride, sampledCoords]);

  React.useEffect(() => {
    if (!ride || sampledCoordCount < RIDE_ROUTE_HEAVY_POINT_THRESHOLD) {
      return;
    }
    let cancelled = false;
    const coords = sampledCoords;
    const g = globalThis as typeof globalThis & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const idle = g.requestIdleCallback;
    const cancelIdle = g.cancelIdleCallback;
    const run = () => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        setRouteGeometry(prepareRideRouteGeometry(coords));
      });
    };
    let idleId: number | undefined;
    const timeoutId = setTimeout(() => {
      if (typeof idle === 'function') {
        idleId = idle(run, { timeout: 400 });
      } else {
        run();
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      if (idleId != null && typeof cancelIdle === 'function') {
        cancelIdle(idleId);
      }
    };
  }, [rideId, ride, sampledCoordCount, sampledCoords]);

  const normalizedCoords = routeGeometry?.normalizedCoords ?? [];
  const polylineCoords = routeGeometry?.polylineCoords ?? [];
  const routeMarkers = routeGeometry?.routeMarkers ?? [];
  const routeBounds = routeGeometry?.routeBounds ?? null;
  const routeRegion = routeGeometry?.routeRegion ?? null;
  const fallbackRouteZoom = routeGeometry?.routeZoom ?? 14;
  const routeZoom =
    routeBounds && mapViewport
      ? calculateRouteFitZoom(routeBounds, mapViewport, 24)
      : fallbackRouteZoom;

  const isHeavyRouteLoading =
    ride != null &&
    sampledCoordCount >= RIDE_ROUTE_HEAVY_POINT_THRESHOLD &&
    routeGeometry === null;

  const [screenLayoutHeight, setScreenLayoutHeight] = React.useState<number | null>(null);

  const handleScreenRootLayout = React.useCallback((event: LayoutChangeEvent) => {
    const { height } = event.nativeEvent.layout;
    if (height > 0) {
      setScreenLayoutHeight((prev) => (prev === height ? prev : height));
    }
  }, []);

  const handleMapLayout = React.useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    setMapViewport((prev) => {
      if (prev && prev.width === width && prev.height === height) {
        return prev;
      }
      return { width, height };
    });
  }, []);

  const focusRoute = React.useCallback(async () => {
    if (!isMapReady || !mapRef.current || !routeRegion) return;
    const map = mapRef.current;
    try {
      if (map.isViewReady) {
        const viewReady = await map.isViewReady();
        if (!viewReady) return;
      }
      if (typeof map.animateToLocation !== 'function') return;
      await map.animateToLocation(
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

  React.useEffect(() => {
    void focusRoute();
  }, [focusRoute]);

  // expo-osm-sdk (Android): setPolylines вызывается до готовности MapLibre — линии не рисуются и больше не применяются.
  // Сбрасываем флаг при смене поездки и отдаём overlays только после onMapReady.
  React.useEffect(() => {
    setIsMapReady(false);
  }, [route.params.rideId]);

  const handleShareGpx = React.useCallback(async () => {
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

  React.useLayoutEffect(() => {
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

  const sheetExpandedHeight = React.useMemo(() => {
    if (screenLayoutHeight != null && screenLayoutHeight > 0) {
      return Math.round(screenLayoutHeight);
    }
    // До первого onLayout — оценка по окну (таббар и шапка уже «внутри» высоты экрана не вычитаются точно).
    return Math.max(280, Math.round(windowHeight * 0.65));
  }, [screenLayoutHeight, windowHeight]);

  const collapsedSummary = (
    <View style={styles.collapsedStatsRow}>
      <View style={styles.collapsedStat}>
        <Text style={styles.collapsedStatValue}>{formatDistance(ride.distanceKm)}</Text>
        <Text style={styles.collapsedStatLabel}>Дистанция</Text>
      </View>
      <View style={styles.collapsedStatDivider} />
      <View style={styles.collapsedStat}>
        <Text style={styles.collapsedStatValue}>{formatDuration(ride.durationSeconds)}</Text>
        <Text style={styles.collapsedStatLabel}>Время</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.screenRoot} onLayout={handleScreenRootLayout}>
      <View style={styles.mapContainer} onLayout={handleMapLayout}>
        {isHeavyRouteLoading ? (
          <View style={styles.routeCardLoading}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.routeCardLoadingTitle}>Готовим маршрут…</Text>
            <Text style={styles.routeCardLoadingHint}>
              {sampledCoordCount.toLocaleString('ru-RU')} точек на карте
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
              initialZoom={routeRegion ? routeZoom : 14}
              onMapReady={() => setIsMapReady(true)}
              markers={isMapReady ? routeMarkers : []}
              polylines={
                isMapReady && polylineCoords.length > 1
                  ? [
                      {
                        id: RIDE_POLYLINE_ID,
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

      <RideDetailInfoSheet
        key={ride.id}
        expandedHeight={sheetExpandedHeight}
        collapsedSummary={collapsedSummary}
      >
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

          <View style={styles.detailControlBlock}>
            <View style={styles.detailControlHeader}>
              <Text style={styles.detailControlTitle}>Детализация карты</Text>
              <Text style={styles.detailControlValue}>каждая {detailStepInput}-я</Text>
            </View>
            <Slider
              minimumValue={1}
              maximumValue={detailMaxStep}
              step={1}
              value={detailStepInput}
              onValueChange={handleDetailSliderChange}
              onSlidingComplete={handleDetailSliderComplete}
              minimumTrackTintColor="#4CAF50"
              maximumTrackTintColor="#d0d0d0"
              thumbTintColor="#4CAF50"
            />
            <Text style={styles.detailControlHint}>
              Показано {sampledCoordCount.toLocaleString('ru-RU')} из{' '}
              {coordCount.toLocaleString('ru-RU')} точек
            </Text>
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
      </RideDetailInfoSheet>

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
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: '#e0e0e0',
  },
  mapContainer: {
    flex: 1,
    backgroundColor: '#e0e0e0',
  },
  collapsedStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  collapsedStat: {
    flex: 1,
    alignItems: 'center',
  },
  collapsedStatDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: '#e0e0e0',
    marginHorizontal: 4,
  },
  collapsedStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4CAF50',
  },
  collapsedStatLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
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
    paddingBottom: 8,
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
  detailControlBlock: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  detailControlHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  detailControlTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  detailControlValue: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '600',
  },
  detailControlHint: {
    marginTop: 6,
    fontSize: 12,
    color: '#777',
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
