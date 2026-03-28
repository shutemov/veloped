import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Coordinate, TrackingState } from '../types';
import { calculateTotalDistance } from '../utils/haversine';
import {
  createBridgeState,
  bridgeStep,
  bridgeStateToCoordinate,
  type BridgeState,
} from '../utils/gpsBridge';
import { LOCATION_TASK_NAME, ACTIVE_RIDE_KEY } from '../tasks/locationTask';
import { useGpsAccuracy, type GpsQualityZone } from './useGpsAccuracy';
import { reduceGpsQualityZone, DEFAULT_GPS_ACCURACY_HYSTERESIS } from '../utils/gpsAccuracy';

const BRIDGE_SENSOR_INTERVAL_MS = 100;

/** Размер кольцевого буфера надёжных GPS-точек. */
const RELIABLE_BUFFER_SIZE = 5;

export type FinishedTrackingMode = 'gps' | 'imu' | 'sim';

const GPS_OPTIONS = {
  accuracy: Location.Accuracy.High,
  distanceInterval: 10,
  timeInterval: 5000,
};

function locationToCoordinate(location: Location.LocationObject): Coordinate {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    timestamp: location.timestamp,
    source: 'gps',
  };
}

export function useTracking() {
  const {
    gpsAccuracyMeters,
    gpsQualityZone,
    applyLocation: applyGpsLocation,
    seedFromStoredAccuracy: seedGpsFromStoredAccuracy,
    reset: resetGpsAccuracy,
  } = useGpsAccuracy();

  const [state, setState] = React.useState<TrackingState>('idle');
  const [coordinates, setCoordinates] = React.useState<Coordinate[]>([]);
  const [distanceKm, setDistanceKm] = React.useState(0);
  const [durationSeconds, setDurationSeconds] = React.useState(0);
  const [currentLocation, setCurrentLocation] = React.useState<Coordinate | null>(null);
  const [permissionStatus, setPermissionStatus] = React.useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [isSimulating, setIsSimulating] = React.useState(false);
  const [isBridging, setIsBridging] = React.useState(false);

  const startTimeRef = React.useRef<number | null>(null);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const locationSubscriptionRef = React.useRef<Location.LocationSubscription | null>(null);
  const simulationTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const appStateRef = React.useRef<AppStateStatus>(AppState.currentState);
  const lastFinishedTrackingModeRef = React.useRef<FinishedTrackingMode | null>(null);

  // --- Hybrid bridge refs ---
  /** Кольцевой буфер последних reliable GPS-точек для инициализации моста. */
  const reliableBufferRef = React.useRef<Coordinate[]>([]);
  /** Текущее состояние IMU-моста. null = мост не активен. */
  const bridgeStateRef = React.useRef<BridgeState | null>(null);
  /** Флаг активности моста (ref-зеркало isBridging для доступа внутри callbacks). */
  const isBridgingRef = React.useRef(false);
  /**
   * Синхронное зеркало текущей зоны -- обновляется сразу при вычислении зоны в handleGpsLocation,
   * не зависит от цикла рендера React (в отличие от useEffect-синхронизации).
   */
  const gpsQualityZoneRef = React.useRef<GpsQualityZone>('unknown');
  /** Последнее значение гироскопа (Z-ось), обновляется из gyro listener. */
  const bridgeGyroZRef = React.useRef(0);
  /** Subscriptions для сенсоров IMU-моста. */
  const bridgeAccSubRef = React.useRef<{ remove: () => void } | null>(null);
  const bridgeGyroSubRef = React.useRef<{ remove: () => void } | null>(null);

  // --- Bridge helpers ---

  const pushToReliableBuffer = (coord: Coordinate) => {
    reliableBufferRef.current = [
      ...reliableBufferRef.current.slice(-(RELIABLE_BUFFER_SIZE - 1)),
      coord,
    ];
  };

  const stopBridge = React.useCallback(() => {
    if (bridgeAccSubRef.current) {
      bridgeAccSubRef.current.remove();
      bridgeAccSubRef.current = null;
    }
    if (bridgeGyroSubRef.current) {
      bridgeGyroSubRef.current.remove();
      bridgeGyroSubRef.current = null;
    }
    bridgeStateRef.current = null;
    bridgeGyroZRef.current = 0;
    isBridgingRef.current = false;
    setIsBridging(false);
  }, []);

  const startBridge = React.useCallback(() => {
    const buffer = reliableBufferRef.current;
    if (buffer.length === 0) {
      return;
    }

    bridgeStateRef.current = createBridgeState(buffer);
    isBridgingRef.current = true;
    setIsBridging(true);

    Gyroscope.setUpdateInterval(BRIDGE_SENSOR_INTERVAL_MS);
    Accelerometer.setUpdateInterval(BRIDGE_SENSOR_INTERVAL_MS);

    bridgeGyroSubRef.current = Gyroscope.addListener((g) => {
      bridgeGyroZRef.current = g.z;
    });

    bridgeAccSubRef.current = Accelerometer.addListener((a) => {
      const prev = bridgeStateRef.current;
      if (!prev) return;

      const ts = a.timestamp != null ? Math.round(a.timestamp * 1000) : Date.now();
      const accelMagnitude = Math.hypot(a.x, a.y, a.z) * 9.80665;
      const next = bridgeStep(prev, bridgeGyroZRef.current, accelMagnitude, ts);
      bridgeStateRef.current = next;

      const coord = bridgeStateToCoordinate(next, ts);
      setCoordinates((prevCoords) => [...prevCoords, coord]);
    });
  }, []);

  // --- GPS watch callback (гибридный) ---

  const handleGpsLocation = React.useCallback(
    (location: Location.LocationObject) => {
      // Обновляем accuracy state (для UI)
      applyGpsLocation(location);

      // Вычисляем зону синхронно -- не из React state (который применится позже),
      // а непосредственно из accuracy, используя тот же алгоритм что и useGpsAccuracy.
      // Это исключает race condition при старте записи.
      const acc = location.coords.accuracy;
      const speedMs = location.coords.speed ?? null;
      const prevZone = gpsQualityZoneRef.current;
      const newZone = reduceGpsQualityZone(prevZone, acc, DEFAULT_GPS_ACCURACY_HYSTERESIS, speedMs);
      gpsQualityZoneRef.current = newZone;

      const coord = locationToCoordinate(location);

      if (newZone === 'reliable') {
        pushToReliableBuffer(coord);
        if (isBridgingRef.current) {
          stopBridge();
        }
        setCoordinates((prev) => [...prev, coord]);
      } else if (newZone === 'uncertain') {
        if (!isBridgingRef.current) {
          startBridge();
        }
        // Ненадёжные GPS-точки в трек не добавляем; мост генерирует точки сам
      }
      // zone === 'unknown' -- начало записи, нет оценки качества; добавляем в трек,
      // но НЕ в reliable-буфер -- у нас нет доверия к этой точке как к якорю для IMU.
      else {
        setCoordinates((prev) => [...prev, coord]);
      }
    },
    [applyGpsLocation, startBridge, stopBridge]
  );

  // --- Storage ---

  const readActiveRideFromStorage = React.useCallback(async () => {
    const raw = await AsyncStorage.getItem(ACTIVE_RIDE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as {
        coordinates?: Coordinate[];
        startTime?: number;
        lastGpsAccuracyMeters?: number | null;
      };
      if (
        typeof parsed.startTime !== 'number' ||
        !Array.isArray(parsed.coordinates) ||
        parsed.coordinates.length === 0
      ) {
        return null;
      }
      return parsed as {
        coordinates: Coordinate[];
        startTime: number;
        lastGpsAccuracyMeters?: number | null;
      };
    } catch {
      return null;
    }
  }, []);

  const attachForegroundWatch = React.useCallback(() => {
    if (locationSubscriptionRef.current) {
      return;
    }
    void (async () => {
      try {
        locationSubscriptionRef.current = await Location.watchPositionAsync(
          GPS_OPTIONS,
          handleGpsLocation
        );
      } catch (e) {
        console.error('watchPositionAsync failed after restore:', e);
      }
    })();
  }, [handleGpsLocation]);

  /** После убийства процесса / холодного старта: трек в AsyncStorage, UI — пустой, пока не подтянем. */
  const hydrateActiveRideIfNeeded = React.useCallback(async () => {
    try {
      const updatesStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (!updatesStarted) {
        return;
      }
      const active = await readActiveRideFromStorage();
      if (!active) {
        return;
      }
      startTimeRef.current = active.startTime;
      setCoordinates(active.coordinates);
      setDurationSeconds(Math.max(0, Math.floor((Date.now() - active.startTime) / 1000)));
      seedGpsFromStoredAccuracy(active.lastGpsAccuracyMeters);
      startDurationTimer();
      attachForegroundWatch();
      setState('tracking');
    } catch (e) {
      console.error('hydrateActiveRideIfNeeded failed:', e);
    }
  }, [attachForegroundWatch, readActiveRideFromStorage, seedGpsFromStoredAccuracy]);

  React.useEffect(() => {
    checkPermissions();
    void hydrateActiveRideIfNeeded();
    return () => {
      cleanup();
    };
  }, []);

  React.useEffect(() => {
    if (coordinates.length > 0) {
      setDistanceKm(calculateTotalDistance(coordinates));
      setCurrentLocation(coordinates[coordinates.length - 1]);
    }
  }, [coordinates]);

  /** Пока приложение в фоне, точки копятся в AsyncStorage; в state остаётся старый срез — подтягиваем при возврате. */
  React.useEffect(() => {
    const syncCoordsFromStorage = async () => {
      if (state !== 'tracking' || isSimulating) {
        return;
      }
      const active = await readActiveRideFromStorage();
      if (!active) {
        return;
      }
      setCoordinates((prev) =>
        active.coordinates.length > prev.length ? active.coordinates : prev
      );
      seedGpsFromStoredAccuracy(active.lastGpsAccuracyMeters);
    };

    const onChange = (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev.match(/inactive|background/) && next === 'active') {
        void syncCoordsFromStorage();
      }
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [state, isSimulating, readActiveRideFromStorage, seedGpsFromStoredAccuracy]);

  const checkPermissions = async () => {
    const { status } = await Location.getForegroundPermissionsAsync();
    setPermissionStatus(status === 'granted' ? 'granted' : 'undetermined');
  };

  const requestPermissions = async (): Promise<boolean> => {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      setPermissionStatus('denied');
      return false;
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      console.warn('Background location permission not granted');
    }

    setPermissionStatus('granted');
    return true;
  };

  const fetchLocationObject = React.useCallback(async (): Promise<Location.LocationObject | null> => {
    try {
      return await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
    } catch (error) {
      console.warn('getCurrentPositionAsync failed, trying last known:', error);
      try {
        const last = await Location.getLastKnownPositionAsync({
          maxAge: 120_000,
        });
        return last;
      } catch (e) {
        console.error('Failed to get last known position:', e);
        return null;
      }
    }
  }, []);

  const getCurrentPosition = async (): Promise<Coordinate | null> => {
    const location = await fetchLocationObject();
    return location ? locationToCoordinate(location) : null;
  };

  const startDurationTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setDurationSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
  };

  const buildDemoRoute = (start: Coordinate): Coordinate[] => {
    const dLat = 0.00018;
    const dLon = 0.00023;
    const waypoints: Coordinate[] = [
      start,
      { ...start, latitude: start.latitude + dLat * 2, longitude: start.longitude + dLon * 2 },
      { ...start, latitude: start.latitude + dLat * 6, longitude: start.longitude + dLon * 3 },
      { ...start, latitude: start.latitude + dLat * 8, longitude: start.longitude - dLon },
      { ...start, latitude: start.latitude + dLat * 5, longitude: start.longitude - dLon * 4 },
      { ...start, latitude: start.latitude + dLat * 2, longitude: start.longitude - dLon * 2 },
      start,
    ];

    const route: Coordinate[] = [];
    const stepsPerSegment = 6;

    for (let i = 1; i < waypoints.length; i++) {
      const from = waypoints[i - 1];
      const to = waypoints[i];
      for (let step = 0; step < stepsPerSegment; step++) {
        const t = step / stepsPerSegment;
        route.push({
          latitude: from.latitude + (to.latitude - from.latitude) * t,
          longitude: from.longitude + (to.longitude - from.longitude) * t,
          timestamp: Date.now(),
        });
      }
    }

    route.push({
      latitude: waypoints[waypoints.length - 1].latitude,
      longitude: waypoints[waypoints.length - 1].longitude,
      timestamp: Date.now(),
    });

    return route;
  };

  const start = React.useCallback(async (): Promise<boolean> => {
    if (state !== 'idle') return false;

    const hasPermission = await requestPermissions();
    if (!hasPermission) return false;

    resetGpsAccuracy();
    reliableBufferRef.current = [];
    gpsQualityZoneRef.current = 'unknown';
    const initialLocObj = await fetchLocationObject();
    if (!initialLocObj) return false;

    applyGpsLocation(initialLocObj);
    // Синхронно инициализируем ref зоны из начального фикса,
    // чтобы handleGpsLocation видел актуальную зону сразу при первом вызове watchPositionAsync.
    gpsQualityZoneRef.current = reduceGpsQualityZone(
      'unknown',
      initialLocObj.coords.accuracy,
      DEFAULT_GPS_ACCURACY_HYSTERESIS,
      initialLocObj.coords.speed ?? null
    );
    const initialLocation = locationToCoordinate(initialLocObj);
    // Кладём в reliable-буфер только если точка действительно надёжная.
    // Unknown-точки не становятся якорем -- без них мост не запустится
    // пока не появится хотя бы один надёжный GPS-фикс.
    if (gpsQualityZoneRef.current === 'reliable') {
      pushToReliableBuffer(initialLocation);
    }

    startTimeRef.current = Date.now();
    const initialCoords = [initialLocation];
    setCoordinates(initialCoords);
    setCurrentLocation(initialLocation);
    setDistanceKm(0);
    setDurationSeconds(0);

    await AsyncStorage.setItem(
      ACTIVE_RIDE_KEY,
      JSON.stringify({
        coordinates: initialCoords,
        startTime: startTimeRef.current,
        lastGpsAccuracyMeters: initialLocObj.coords.accuracy ?? null,
      })
    );

    locationSubscriptionRef.current = await Location.watchPositionAsync(
      GPS_OPTIONS,
      handleGpsLocation
    );

    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      distanceInterval: GPS_OPTIONS.distanceInterval,
      timeInterval: GPS_OPTIONS.timeInterval,
      foregroundService: {
        notificationTitle: 'Veloped',
        notificationBody: 'Запись маршрута...',
        notificationColor: '#4CAF50',
      },
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    });

    startDurationTimer();

    setState('tracking');
    return true;
  }, [state, resetGpsAccuracy, fetchLocationObject, applyGpsLocation, handleGpsLocation]);

  const startSimulation = React.useCallback(async (): Promise<boolean> => {
    if (state !== 'idle') return false;

    resetGpsAccuracy();
    const initialLocation =
      (await getCurrentPosition()) ??
      ({
        latitude: 55.751244,
        longitude: 37.618423,
        timestamp: Date.now(),
      } as Coordinate);

    const route = buildDemoRoute(initialLocation);
    let routeIndex = 0;
    const simulatedCoords: Coordinate[] = [];

    startTimeRef.current = Date.now();
    setCoordinates([]);
    setCurrentLocation(initialLocation);
    setDistanceKm(0);
    setDurationSeconds(0);
    setIsSimulating(true);
    setState('tracking');

    startDurationTimer();

    simulationTimerRef.current = setInterval(() => {
      if (routeIndex >= route.length) {
        void (async () => {
          await cleanup();
          setIsSimulating(false);
          setState('finished');
        })();
        return;
      }

      const nextPoint = {
        ...route[routeIndex],
        timestamp: Date.now(),
      };
      routeIndex += 1;
      simulatedCoords.push(nextPoint);

      setCoordinates([...simulatedCoords]);
      setCurrentLocation(nextPoint);

      void AsyncStorage.setItem(
        ACTIVE_RIDE_KEY,
        JSON.stringify({
          coordinates: simulatedCoords,
          startTime: startTimeRef.current,
        })
      );
    }, 1000);

    return true;
  }, [state, resetGpsAccuracy]);

  const stop = React.useCallback(async () => {
    if (state !== 'tracking') return;

    lastFinishedTrackingModeRef.current = isSimulating ? 'sim' : isBridging ? 'imu' : 'gps';

    cleanup();
    setIsSimulating(false);

    const storedData = await AsyncStorage.getItem(ACTIVE_RIDE_KEY);
    if (storedData) {
      const parsed = JSON.parse(storedData);
      if (parsed.coordinates && parsed.coordinates.length > coordinates.length) {
        setCoordinates(parsed.coordinates);
      }
    }

    setState('finished');
  }, [state, coordinates.length, isSimulating, isBridging]);

  const reset = React.useCallback(async () => {
    cleanup();
    setCoordinates([]);
    setDistanceKm(0);
    setDurationSeconds(0);
    setCurrentLocation(null);
    setIsSimulating(false);
    reliableBufferRef.current = [];
    gpsQualityZoneRef.current = 'unknown';
    startTimeRef.current = null;
    lastFinishedTrackingModeRef.current = null;
    await AsyncStorage.removeItem(ACTIVE_RIDE_KEY);
    setState('idle');
  }, []);

  const cleanup = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (locationSubscriptionRef.current) {
      locationSubscriptionRef.current.remove();
      locationSubscriptionRef.current = null;
    }

    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }

    // Останавливаем IMU-мост если активен
    if (bridgeAccSubRef.current) {
      bridgeAccSubRef.current.remove();
      bridgeAccSubRef.current = null;
    }
    if (bridgeGyroSubRef.current) {
      bridgeGyroSubRef.current.remove();
      bridgeGyroSubRef.current = null;
    }
    bridgeStateRef.current = null;
    isBridgingRef.current = false;
    setIsBridging(false);

    const isTaskRunning = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isTaskRunning) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }

    resetGpsAccuracy();
  };

  const getStartTime = React.useCallback(() => startTimeRef.current, []);

  const getLastFinishedTrackingMode = React.useCallback(
    (): FinishedTrackingMode | null => lastFinishedTrackingModeRef.current,
    []
  );

  return {
    state,
    coordinates,
    distanceKm,
    durationSeconds,
    currentLocation,
    gpsAccuracyMeters,
    gpsQualityZone,
    permissionStatus,
    isSimulating,
    isBridging,
    start,
    startSimulation,
    stop,
    reset,
    getStartTime,
    getCurrentPosition,
    getLastFinishedTrackingMode,
  };
}
