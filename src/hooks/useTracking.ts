import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActiveRideData, Coordinate, TrackingState } from '../types';
import { calculateTotalDistance } from '../utils/haversine';
import { LOCATION_TASK_NAME, ACTIVE_RIDE_KEY } from '../tasks/locationTask';
import { useGpsAccuracy } from './useGpsAccuracy';

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

  const startTimeRef = React.useRef<number | null>(null);
  const totalPausedMsRef = React.useRef(0);
  const pauseStartedAtRef = React.useRef<number | null>(null);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const locationSubscriptionRef = React.useRef<Location.LocationSubscription | null>(null);
  const simulationTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const appStateRef = React.useRef<AppStateStatus>(AppState.currentState);
  const stateRef = React.useRef<TrackingState>('idle');
  const coordinatesRef = React.useRef<Coordinate[]>([]);
  const segmentStartIndicesRef = React.useRef<number[]>([]);
  const [segmentStartIndices, setSegmentStartIndices] = React.useState<number[]>([]);

  React.useEffect(() => {
    stateRef.current = state;
  }, [state]);

  React.useEffect(() => {
    coordinatesRef.current = coordinates;
  }, [coordinates]);

  React.useEffect(() => {
    segmentStartIndicesRef.current = segmentStartIndices;
  }, [segmentStartIndices]);

  const computeActiveMs = React.useCallback(() => {
    if (startTimeRef.current == null) return 0;
    const now = Date.now();
    const openPauseMs =
      pauseStartedAtRef.current != null ? Math.max(0, now - pauseStartedAtRef.current) : 0;
    return Math.max(0, now - startTimeRef.current - totalPausedMsRef.current - openPauseMs);
  }, []);

  const computeActiveSeconds = React.useCallback(
    () => Math.floor(computeActiveMs() / 1000),
    [computeActiveMs]
  );

  const handleGpsLocation = React.useCallback(
    (location: Location.LocationObject) => {
      if (stateRef.current !== 'tracking') {
        return;
      }
      applyGpsLocation(location);
      const coord = locationToCoordinate(location);
      setCoordinates((prev) => [...prev, coord]);
    },
    [applyGpsLocation]
  );

  const readActiveRideFromStorage = React.useCallback(async () => {
    const raw = await AsyncStorage.getItem(ACTIVE_RIDE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as ActiveRideData;
      if (
        typeof parsed.startTime !== 'number' ||
        !Array.isArray(parsed.coordinates) ||
        parsed.coordinates.length === 0
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }, []);

  const upsertActiveRideMeta = React.useCallback(
    async (patch: Partial<ActiveRideData>) => {
      const active = await readActiveRideFromStorage();
      if (!active) return;
      await AsyncStorage.setItem(
        ACTIVE_RIDE_KEY,
        JSON.stringify({
          ...active,
          ...patch,
        } satisfies ActiveRideData)
      );
    },
    [readActiveRideFromStorage]
  );

  const attachForegroundWatch = React.useCallback(async () => {
    if (locationSubscriptionRef.current) {
      return;
    }
    try {
      locationSubscriptionRef.current = await Location.watchPositionAsync(
        GPS_OPTIONS,
        handleGpsLocation
      );
    } catch (e) {
      console.error('watchPositionAsync failed after restore:', e);
    }
  }, [handleGpsLocation]);

  const detachForegroundWatch = React.useCallback(() => {
    if (locationSubscriptionRef.current) {
      locationSubscriptionRef.current.remove();
      locationSubscriptionRef.current = null;
    }
  }, []);

  const startBackgroundUpdates = React.useCallback(async () => {
    const isTaskRunning = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isTaskRunning) {
      return;
    }
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
  }, []);

  const stopBackgroundUpdates = React.useCallback(async () => {
    const isTaskRunning = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isTaskRunning) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  }, []);

  const startDurationTimer = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    timerRef.current = setInterval(() => {
      setDurationSeconds(computeActiveSeconds());
    }, 1000);
  }, [computeActiveSeconds]);

  /** После убийства процесса / холодного старта: трек в AsyncStorage, UI — пустой, пока не подтянем. */
  const hydrateActiveRideIfNeeded = React.useCallback(async () => {
    try {
      const active = await readActiveRideFromStorage();
      if (!active) {
        return;
      }
      startTimeRef.current = active.startTime;
      totalPausedMsRef.current = active.totalPausedMs ?? 0;
      pauseStartedAtRef.current =
        active.isPaused && typeof active.pauseStartedAt === 'number'
          ? active.pauseStartedAt
          : null;
      setCoordinates(active.coordinates);
      setSegmentStartIndices(
        Array.isArray(active.segmentStartIndices) ? active.segmentStartIndices : []
      );
      setDurationSeconds(computeActiveSeconds());
      seedGpsFromStoredAccuracy(active.lastGpsAccuracyMeters);
      startDurationTimer();

      if (active.isPaused) {
        setState('paused');
        return;
      }

      setState('tracking');

      const updatesStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (updatesStarted) {
        await attachForegroundWatch();
      } else {
        await attachForegroundWatch();
        await startBackgroundUpdates();
      }
    } catch (e) {
      console.error('hydrateActiveRideIfNeeded failed:', e);
    }
  }, [
    attachForegroundWatch,
    computeActiveSeconds,
    readActiveRideFromStorage,
    seedGpsFromStoredAccuracy,
    startBackgroundUpdates,
    startDurationTimer,
  ]);

  React.useEffect(() => {
    void checkPermissions();
    void hydrateActiveRideIfNeeded();
    return () => {
      void cleanup();
    };
  }, [hydrateActiveRideIfNeeded]);

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
      if (Array.isArray(active.segmentStartIndices)) {
        setSegmentStartIndices(active.segmentStartIndices);
      }
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

  const checkPermissions = React.useCallback(async () => {
    const { status } = await Location.getForegroundPermissionsAsync();
    setPermissionStatus(status === 'granted' ? 'granted' : 'undetermined');
  }, []);

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
    const initialLocObj = await fetchLocationObject();
    if (!initialLocObj) return false;

    applyGpsLocation(initialLocObj);
    const initialLocation = locationToCoordinate(initialLocObj);

    startTimeRef.current = Date.now();
    totalPausedMsRef.current = 0;
    pauseStartedAtRef.current = null;
    const initialCoords = [initialLocation];
    setCoordinates(initialCoords);
    setCurrentLocation(initialLocation);
    setDistanceKm(0);
    setDurationSeconds(0);

    setSegmentStartIndices([]);
    await AsyncStorage.setItem(
      ACTIVE_RIDE_KEY,
      JSON.stringify({
        coordinates: initialCoords,
        startTime: startTimeRef.current,
        lastGpsAccuracyMeters: initialLocObj.coords.accuracy ?? null,
        isPaused: false,
        totalPausedMs: 0,
        pauseStartedAt: null,
        segmentStartIndices: [],
      })
    );

    await attachForegroundWatch();
    await startBackgroundUpdates();

    startDurationTimer();

    setState('tracking');
    return true;
  }, [
    state,
    resetGpsAccuracy,
    fetchLocationObject,
    applyGpsLocation,
    attachForegroundWatch,
    startBackgroundUpdates,
    startDurationTimer,
  ]);

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
    totalPausedMsRef.current = 0;
    pauseStartedAtRef.current = null;
    setSegmentStartIndices([]);
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
          isPaused: false,
          totalPausedMs: 0,
          pauseStartedAt: null,
          segmentStartIndices: [],
        })
      );
    }, 1000);

    return true;
  }, [state, resetGpsAccuracy]);

  const pause = React.useCallback(async () => {
    if (state !== 'tracking' || isSimulating) return;

    pauseStartedAtRef.current = Date.now();
    setState('paused');
    setDurationSeconds(computeActiveSeconds());
    detachForegroundWatch();
    await stopBackgroundUpdates();
    await upsertActiveRideMeta({
      isPaused: true,
      totalPausedMs: totalPausedMsRef.current,
      pauseStartedAt: pauseStartedAtRef.current,
    });
  }, [
    state,
    isSimulating,
    computeActiveSeconds,
    detachForegroundWatch,
    stopBackgroundUpdates,
    upsertActiveRideMeta,
  ]);

  const resume = React.useCallback(async () => {
    if (state !== 'paused' || isSimulating) return;

    if (pauseStartedAtRef.current != null) {
      totalPausedMsRef.current += Math.max(0, Date.now() - pauseStartedAtRef.current);
    }
    pauseStartedAtRef.current = null;
    setDurationSeconds(computeActiveSeconds());
    setState('tracking');

    const nextSegmentStarts = [
      ...segmentStartIndicesRef.current,
      coordinatesRef.current.length,
    ];
    setSegmentStartIndices(nextSegmentStarts);

    await upsertActiveRideMeta({
      isPaused: false,
      totalPausedMs: totalPausedMsRef.current,
      pauseStartedAt: null,
      segmentStartIndices: nextSegmentStarts,
    });
    await attachForegroundWatch();
    await startBackgroundUpdates();
  }, [
    state,
    isSimulating,
    computeActiveSeconds,
    upsertActiveRideMeta,
    attachForegroundWatch,
    startBackgroundUpdates,
  ]);

  const stop = React.useCallback(async () => {
    if (state !== 'tracking' && state !== 'paused') return;

    const finalDurationSeconds = computeActiveSeconds();

    await cleanup();
    setIsSimulating(false);
    setDurationSeconds(finalDurationSeconds);

    const storedData = await AsyncStorage.getItem(ACTIVE_RIDE_KEY);
    if (storedData) {
      const parsed = JSON.parse(storedData) as ActiveRideData;
      if (Array.isArray(parsed.coordinates) && parsed.coordinates.length >= coordinates.length) {
        setCoordinates(parsed.coordinates);
      }
      if (Array.isArray(parsed.segmentStartIndices)) {
        setSegmentStartIndices(parsed.segmentStartIndices);
      }
    }

    setState('finished');
  }, [state, coordinates.length, computeActiveSeconds]);

  const reset = React.useCallback(async () => {
    await cleanup();
    setCoordinates([]);
    setDistanceKm(0);
    setDurationSeconds(0);
    setCurrentLocation(null);
    setIsSimulating(false);
    startTimeRef.current = null;
    totalPausedMsRef.current = 0;
    pauseStartedAtRef.current = null;
    await AsyncStorage.removeItem(ACTIVE_RIDE_KEY);
    setSegmentStartIndices([]);
    setState('idle');
  }, []);

  const cleanup = React.useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    detachForegroundWatch();

    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }

    await stopBackgroundUpdates();

    resetGpsAccuracy();
  }, [detachForegroundWatch, stopBackgroundUpdates, resetGpsAccuracy]);

  const getStartTime = React.useCallback(() => startTimeRef.current, []);

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
    start,
    startSimulation,
    pause,
    resume,
    stop,
    reset,
    getStartTime,
    getCurrentPosition,
    segmentStartIndices,
  };
}
