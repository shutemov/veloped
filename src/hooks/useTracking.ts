import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Location from 'expo-location';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Coordinate, TrackingState } from '../types';
import { calculateTotalDistance } from '../utils/haversine';
import {
  createImuDrState,
  imuDeadReckoningStep,
  imuStateToCoordinate,
  type ImuDrState,
} from '../utils/imuDeadReckoning';
import { LOCATION_TASK_NAME, ACTIVE_RIDE_KEY } from '../tasks/locationTask';

const IMU_TRACKING_INTERVAL_MS = 100;

export type FinishedTrackingMode = 'gps' | 'imu' | 'sim';

const GPS_OPTIONS = {
  accuracy: Location.Accuracy.High,
  distanceInterval: 10,
  timeInterval: 5000,
};

export function useTracking() {
  const [state, setState] = React.useState<TrackingState>('idle');
  const [coordinates, setCoordinates] = React.useState<Coordinate[]>([]);
  const [distanceKm, setDistanceKm] = React.useState(0);
  const [durationSeconds, setDurationSeconds] = React.useState(0);
  const [currentLocation, setCurrentLocation] = React.useState<Coordinate | null>(null);
  const [permissionStatus, setPermissionStatus] = React.useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [isSimulating, setIsSimulating] = React.useState(false);
  const [isImuTracking, setIsImuTracking] = React.useState(false);

  const startTimeRef = React.useRef<number | null>(null);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const locationSubscriptionRef = React.useRef<Location.LocationSubscription | null>(null);
  const simulationTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const appStateRef = React.useRef<AppStateStatus>(AppState.currentState);
  const imuAccSubscriptionRef = React.useRef<{ remove: () => void } | null>(null);
  const imuGyroSubscriptionRef = React.useRef<{ remove: () => void } | null>(null);
  const imuDrStateRef = React.useRef<ImuDrState | null>(null);
  const gyroLastRef = React.useRef<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const lastFinishedTrackingModeRef = React.useRef<FinishedTrackingMode | null>(null);

  const readActiveRideFromStorage = React.useCallback(async () => {
    const raw = await AsyncStorage.getItem(ACTIVE_RIDE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { coordinates?: Coordinate[]; startTime?: number };
      if (
        typeof parsed.startTime !== 'number' ||
        !Array.isArray(parsed.coordinates) ||
        parsed.coordinates.length === 0
      ) {
        return null;
      }
      return parsed as { coordinates: Coordinate[]; startTime: number };
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
          (location) => {
            const newCoord: Coordinate = {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              timestamp: location.timestamp,
            };
            setCoordinates((prev) => [...prev, newCoord]);
          }
        );
      } catch (e) {
        console.error('watchPositionAsync failed after restore:', e);
      }
    })();
  }, []);

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
      startDurationTimer();
      attachForegroundWatch();
      setState('tracking');
    } catch (e) {
      console.error('hydrateActiveRideIfNeeded failed:', e);
    }
  }, [attachForegroundWatch, readActiveRideFromStorage]);

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
      if (state !== 'tracking' || isSimulating || isImuTracking) {
        return;
      }
      const active = await readActiveRideFromStorage();
      if (!active) {
        return;
      }
      setCoordinates((prev) =>
        active.coordinates.length > prev.length ? active.coordinates : prev
      );
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
  }, [state, isSimulating, isImuTracking, readActiveRideFromStorage]);

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

  const getCurrentPosition = async (): Promise<Coordinate | null> => {
    const toCoord = (location: Location.LocationObject): Coordinate => ({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      timestamp: location.timestamp,
    });

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      return toCoord(location);
    } catch (error) {
      console.warn('getCurrentPositionAsync failed, trying last known:', error);
      try {
        const last = await Location.getLastKnownPositionAsync({
          maxAge: 120_000,
        });
        if (last) {
          return toCoord(last);
        }
      } catch (e) {
        console.error('Failed to get last known position:', e);
      }
      return null;
    }
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

    const initialLocation = await getCurrentPosition();
    if (!initialLocation) return false;

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
      })
    );

    locationSubscriptionRef.current = await Location.watchPositionAsync(
      GPS_OPTIONS,
      (location) => {
        const newCoord: Coordinate = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          timestamp: location.timestamp,
        };
        setCoordinates((prev) => [...prev, newCoord]);
      }
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
  }, [state]);

  const startImuTracking = React.useCallback(async (): Promise<boolean> => {
    if (!__DEV__) {
      return false;
    }
    if (state !== 'idle') {
      return false;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setPermissionStatus('denied');
      return false;
    }
    setPermissionStatus('granted');

    const [accelerometerAvailable, gyroscopeAvailable] = await Promise.all([
      Accelerometer.isAvailableAsync(),
      Gyroscope.isAvailableAsync(),
    ]);
    if (!accelerometerAvailable || !gyroscopeAvailable) {
      return false;
    }

    const initialLocation = await getCurrentPosition();
    if (!initialLocation) {
      return false;
    }

    imuDrStateRef.current = createImuDrState(initialLocation);
    gyroLastRef.current = { x: 0, y: 0, z: 0 };

    startTimeRef.current = Date.now();
    const initialCoords = [initialLocation];
    setCoordinates(initialCoords);
    setCurrentLocation(initialLocation);
    setDistanceKm(0);
    setDurationSeconds(0);
    setIsImuTracking(true);

    await AsyncStorage.setItem(
      ACTIVE_RIDE_KEY,
      JSON.stringify({
        coordinates: initialCoords,
        startTime: startTimeRef.current,
        mode: 'imu',
      })
    );

    Accelerometer.setUpdateInterval(IMU_TRACKING_INTERVAL_MS);
    Gyroscope.setUpdateInterval(IMU_TRACKING_INTERVAL_MS);

    imuGyroSubscriptionRef.current = Gyroscope.addListener((g) => {
      gyroLastRef.current = { x: g.x, y: g.y, z: g.z };
    });

    imuAccSubscriptionRef.current = Accelerometer.addListener((a) => {
      const prevState = imuDrStateRef.current;
      if (!prevState) {
        return;
      }
      const ts =
        a.timestamp != null ? Math.round(a.timestamp * 1000) : Date.now();
      imuDrStateRef.current = imuDeadReckoningStep(
        prevState,
        { x: a.x, y: a.y, z: a.z },
        gyroLastRef.current,
        ts
      );
      const coord = imuStateToCoordinate(imuDrStateRef.current, ts);
      setCoordinates((prev) => {
        const next = [...prev, coord];
        if (next.length % 10 === 0) {
          void AsyncStorage.setItem(
            ACTIVE_RIDE_KEY,
            JSON.stringify({
              coordinates: next,
              startTime: startTimeRef.current,
              mode: 'imu',
            })
          );
        }
        return next;
      });
    });

    startDurationTimer();
    setState('tracking');
    return true;
  }, [state]);

  const startSimulation = React.useCallback(async (): Promise<boolean> => {
    if (state !== 'idle') return false;

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
    setIsImuTracking(false);
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
  }, [state]);

  const stop = React.useCallback(async () => {
    if (state !== 'tracking') return;

    lastFinishedTrackingModeRef.current = isImuTracking
      ? 'imu'
      : isSimulating
        ? 'sim'
        : 'gps';

    cleanup();
    setIsSimulating(false);
    setIsImuTracking(false);

    const storedData = await AsyncStorage.getItem(ACTIVE_RIDE_KEY);
    if (storedData) {
      const parsed = JSON.parse(storedData);
      if (parsed.coordinates && parsed.coordinates.length > coordinates.length) {
        setCoordinates(parsed.coordinates);
      }
    }

    setState('finished');
  }, [state, coordinates.length, isImuTracking, isSimulating]);

  const reset = React.useCallback(async () => {
    cleanup();
    setCoordinates([]);
    setDistanceKm(0);
    setDurationSeconds(0);
    setCurrentLocation(null);
    setIsSimulating(false);
    setIsImuTracking(false);
    startTimeRef.current = null;
    lastFinishedTrackingModeRef.current = null;
    imuDrStateRef.current = null;
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

    if (imuAccSubscriptionRef.current) {
      imuAccSubscriptionRef.current.remove();
      imuAccSubscriptionRef.current = null;
    }
    if (imuGyroSubscriptionRef.current) {
      imuGyroSubscriptionRef.current.remove();
      imuGyroSubscriptionRef.current = null;
    }

    const isTaskRunning = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isTaskRunning) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
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
    permissionStatus,
    isSimulating,
    isImuTracking,
    start,
    startSimulation,
    startImuTracking,
    stop,
    reset,
    getStartTime,
    getCurrentPosition,
    getLastFinishedTrackingMode,
  };
}
