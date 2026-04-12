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
import { haversineDistance } from '../utils/haversine';
import type { Coordinate } from '../types';
import {
  prepareRideRouteGeometry,
  buildSegmentBoundaryMarkers,
  calculateRouteFitZoom,
  RIDE_ROUTE_HEAVY_POINT_THRESHOLD,
  type PreparedRouteGeometry,
} from '../utils/prepareRideRouteGeometry';
import { buildDetailSegmentPolylines } from '../utils/rideSegments';
import { RideDetailInfoSheet } from '../components/RideDetailInfoSheet';

type RideDetailParams = {
  RideDetail: { rideId: string };
};

type RideDetailNavigationProp = NativeStackNavigationProp<RideDetailParams, 'RideDetail'>;
const RIDE_POLYLINE_ID = 'ride_route';
const OUTLIER_SPEED_THRESHOLD_KMH = 72;
const OUTLIER_SPIKE_RATIO = 1.9;
const OUTLIER_MIN_SEGMENT_METERS = 35;
const OUTLIER_MAX_DIRECT_METERS = 75;
const OUTLIER_LARGE_JUMP_METERS = 180;
const OUTLIER_PASSES = 2;

function deltaTimeHours(fromTs: number, toTs: number): number | null {
  if (!Number.isFinite(fromTs) || !Number.isFinite(toTs)) return null;
  const rawDelta = toTs - fromTs;
  if (rawDelta <= 0) return null;
  // Импорт может прийти в секундах (Unix sec) или миллисекундах (Unix ms).
  const isSeconds = Math.max(fromTs, toTs) < 1e11;
  const deltaMs = isSeconds ? rawDelta * 1000 : rawDelta;
  if (deltaMs <= 0) return null;
  return deltaMs / 3_600_000;
}

function filterRouteOutliers(
  coords: Coordinate[]
): { filtered: Coordinate[]; removed: number } {
  if (coords.length < 3) {
    return { filtered: coords, removed: 0 };
  }

  const runSinglePass = (source: Coordinate[]): { filtered: Coordinate[]; removed: number } => {
    if (source.length < 3) {
      return { filtered: source, removed: 0 };
    }
    const kept: Coordinate[] = [source[0]];
    let removed = 0;

    for (let i = 1; i < source.length - 1; i += 1) {
      const prev = kept[kept.length - 1];
      const curr = source[i];
      const next = source[i + 1];

      const prevDistKm = haversineDistance(prev, curr);
      const nextDistKm = haversineDistance(curr, next);
      const directDistKm = haversineDistance(prev, next);

      const prevHours = deltaTimeHours(prev.timestamp, curr.timestamp);
      const nextHours = deltaTimeHours(curr.timestamp, next.timestamp);
      const prevSpeedKmh = prevHours != null && prevHours > 0 ? prevDistKm / prevHours : 0;
      const nextSpeedKmh = nextHours != null && nextHours > 0 ? nextDistKm / nextHours : 0;

      const prevMeters = prevDistKm * 1000;
      const nextMeters = nextDistKm * 1000;
      const detourMeters = prevMeters + nextMeters;
      const directMeters = directDistKm * 1000;

      const looksLikeSpike =
        prevMeters > OUTLIER_MIN_SEGMENT_METERS &&
        nextMeters > OUTLIER_MIN_SEGMENT_METERS &&
        directMeters < OUTLIER_MAX_DIRECT_METERS &&
        detourMeters > directMeters * OUTLIER_SPIKE_RATIO;
      const looksLikeImpossibleSpeed =
        (prevSpeedKmh > OUTLIER_SPEED_THRESHOLD_KMH || nextSpeedKmh > OUTLIER_SPEED_THRESHOLD_KMH) &&
        directMeters < OUTLIER_MAX_DIRECT_METERS * 2;
      const looksLikeLargeJumpBack =
        prevMeters > OUTLIER_LARGE_JUMP_METERS &&
        nextMeters > OUTLIER_LARGE_JUMP_METERS &&
        directMeters < OUTLIER_MAX_DIRECT_METERS * 1.2;

      if (looksLikeSpike || looksLikeImpossibleSpeed || looksLikeLargeJumpBack) {
        removed += 1;
        continue;
      }
      kept.push(curr);
    }

    kept.push(source[source.length - 1]);
    return { filtered: kept, removed };
  };

  let filtered = coords;
  let removedTotal = 0;
  for (let pass = 0; pass < OUTLIER_PASSES; pass += 1) {
    const passResult = runSinglePass(filtered);
    filtered = passResult.filtered;
    removedTotal += passResult.removed;
    if (passResult.removed === 0) break;
  }

  if (filtered.length < 2) {
    return { filtered: coords, removed: 0 };
  }
  // Наивный фильтр не должен "ломать" трек: если срезали слишком много, возвращаем исходник.
  if (filtered.length < Math.max(2, Math.round(coords.length * 0.25))) {
    return { filtered: coords, removed: 0 };
  }
  return { filtered, removed: removedTotal };
}

export function RideDetailScreen() {
  const { height: windowHeight } = useWindowDimensions();
  const route = useRoute<RouteProp<RideDetailParams, 'RideDetail'>>();
  const navigation = useNavigation<RideDetailNavigationProp>();
  const { getRide, deleteRide, loading: ridesLoading } = useRides();
  const [isPointsModalVisible, setIsPointsModalVisible] = React.useState(false);
  const [isMapReady, setIsMapReady] = React.useState(false);
  const [exportingGpx, setExportingGpx] = React.useState(false);
  const [isOutlierFilterEnabled, setIsOutlierFilterEnabled] = React.useState(false);
  const [isOutlierFilterProcessing, setIsOutlierFilterProcessing] = React.useState(false);
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
  const routeCoordsResult = React.useMemo(() => {
    if (!isOutlierFilterEnabled) {
      return { filtered: sampledCoords, removed: 0 };
    }
    return filterRouteOutliers(sampledCoords);
  }, [sampledCoords, isOutlierFilterEnabled]);
  const routeCoords = routeCoordsResult.filtered;
  const sampledCoordCount = routeCoords.length;

  React.useEffect(() => {
    setDetailStep((prev) => Math.min(prev, detailMaxStep));
    setDetailStepInput((prev) => Math.min(prev, detailMaxStep));
  }, [detailMaxStep]);

  const handleDetailSliderStart = React.useCallback(
    (value: number) => {
      const step = Math.max(1, Math.min(Math.round(value), detailMaxStep));
      setDetailStepInput(step);
    },
    [detailMaxStep]
  );

  const handleDetailSliderChange = React.useCallback(
    (value: number) => {
      const step = Math.max(1, Math.min(Math.round(value), detailMaxStep));
      setDetailStepInput(step);
    },
    [detailMaxStep]
  );

  const handleDetailSliderComplete = React.useCallback(
    (value: number) => {
      const step = Math.max(1, Math.min(Math.round(value), detailMaxStep));
      setDetailStepInput(step);
      setDetailStep(step);
    },
    [detailMaxStep]
  );

  const handleToggleOutlierFilter = React.useCallback(() => {
    setIsOutlierFilterProcessing(true);
    setIsOutlierFilterEnabled((prev) => !prev);
  }, []);

  React.useLayoutEffect(() => {
    if (!ride) {
      setRouteGeometry(null);
      setIsOutlierFilterProcessing(false);
      return;
    }
    const coords = routeCoords;
    if (coords.length === 0) {
      setRouteGeometry(prepareRideRouteGeometry([]));
      setIsOutlierFilterProcessing(false);
      return;
    }
    if (coords.length < RIDE_ROUTE_HEAVY_POINT_THRESHOLD) {
      setRouteGeometry(prepareRideRouteGeometry(coords));
      setIsOutlierFilterProcessing(false);
      return;
    }
    setIsOutlierFilterProcessing(true);
  }, [rideId, ride, routeCoords]);

  React.useEffect(() => {
    if (!ride || sampledCoordCount < RIDE_ROUTE_HEAVY_POINT_THRESHOLD) {
      return;
    }
    let cancelled = false;
    const coords = routeCoords;
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
        setIsOutlierFilterProcessing(false);
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
  }, [rideId, ride, sampledCoordCount, routeCoords]);

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

  const detailSegmentPolylines = React.useMemo(() => {
    if (!ride) return null;
    if (isOutlierFilterEnabled) return null;
    if (!ride.segmentStartIndices?.length) return null;
    const segs = buildDetailSegmentPolylines(
      ride.coordinates,
      ride.segmentStartIndices,
      detailStep
    ).filter((p) => p.coordinates.length > 1);
    return segs.length > 0 ? segs : null;
  }, [ride, isOutlierFilterEnabled, detailStep]);

  const polylinesForDetailMap = React.useMemo(() => {
    if (detailSegmentPolylines && detailSegmentPolylines.length > 0) {
      return detailSegmentPolylines;
    }
    if (polylineCoords.length > 1) {
      return [
        {
          id: RIDE_POLYLINE_ID,
          coordinates: polylineCoords,
          strokeColor: '#4CAF50',
          strokeWidth: 6,
        },
      ];
    }
    return [];
  }, [detailSegmentPolylines, polylineCoords]);

  /** На маршруте с паузами маркеры по полному треку и границам отрезков, а не только по прореженной линии. */
  const mapMarkers = React.useMemo(() => {
    if (!ride) {
      return [];
    }
    if (isOutlierFilterEnabled || !ride.segmentStartIndices?.length) {
      return routeMarkers;
    }
    return buildSegmentBoundaryMarkers(ride.coordinates, ride.segmentStartIndices);
  }, [ride, isOutlierFilterEnabled, routeMarkers]);

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
              markers={isMapReady ? mapMarkers : []}
              polylines={isMapReady ? polylinesForDetailMap : []}
            />
            {polylinesForDetailMap.length === 0 && (
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
              onSlidingStart={handleDetailSliderStart}
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
            <Pressable
              style={[
                styles.outlierFilterButton,
                isOutlierFilterProcessing
                  ? styles.outlierFilterButtonProcessing
                  : isOutlierFilterEnabled
                  ? styles.outlierFilterButtonEnabled
                  : styles.outlierFilterButtonDisabled,
              ]}
              onPress={handleToggleOutlierFilter}
              disabled={isOutlierFilterProcessing}
              accessibilityRole="button"
              accessibilityLabel="Переключить фильтр выбросов маршрута"
            >
              {isOutlierFilterProcessing ? (
                <View style={styles.outlierFilterProcessingRow}>
                  <ActivityIndicator size="small" color="#2e7d32" />
                  <Text style={[styles.outlierFilterButtonText, styles.outlierFilterButtonTextEnabled]}>
                    Обрабатываем маршрут...
                  </Text>
                </View>
              ) : (
                <Text
                  style={[
                    styles.outlierFilterButtonText,
                    isOutlierFilterEnabled
                      ? styles.outlierFilterButtonTextEnabled
                      : styles.outlierFilterButtonTextDisabled,
                  ]}
                >
                  {isOutlierFilterEnabled ? 'Фильтр выбросов: включен' : 'Отфильтровать выбросы'}
                </Text>
              )}
            </Pressable>
            {isOutlierFilterEnabled ? (
              <Text style={styles.outlierFilterHint}>
                Убрано {routeCoordsResult.removed.toLocaleString('ru-RU')} выбросов
              </Text>
            ) : null}
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
  outlierFilterButton: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  outlierFilterButtonEnabled: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50',
  },
  outlierFilterButtonProcessing: {
    backgroundColor: '#e8f5e9',
    borderColor: '#81c784',
  },
  outlierFilterButtonDisabled: {
    backgroundColor: '#f7f7f7',
    borderColor: '#d8d8d8',
  },
  outlierFilterButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  outlierFilterButtonTextEnabled: {
    color: '#2e7d32',
  },
  outlierFilterButtonTextDisabled: {
    color: '#4f4f4f',
  },
  outlierFilterProcessingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  outlierFilterHint: {
    marginTop: 6,
    fontSize: 12,
    color: '#6b6b6b',
    textAlign: 'center',
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
