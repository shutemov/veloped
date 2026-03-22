import { useState, useEffect, useCallback, useRef } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Coordinate, TrackingState } from '../types';
import { calculateTotalDistance } from '../utils/haversine';
import { LOCATION_TASK_NAME, ACTIVE_RIDE_KEY } from '../tasks/locationTask';

const GPS_OPTIONS = {
  accuracy: Location.Accuracy.High,
  distanceInterval: 10,
  timeInterval: 5000,
};

export function useTracking() {
  const [state, setState] = useState<TrackingState>('idle');
  const [coordinates, setCoordinates] = useState<Coordinate[]>([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [currentLocation, setCurrentLocation] = useState<Coordinate | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');
  const [isSimulating, setIsSimulating] = useState(false);

  const startTimeRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const simulationTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    checkPermissions();
    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (coordinates.length > 0) {
      setDistanceKm(calculateTotalDistance(coordinates));
      setCurrentLocation(coordinates[coordinates.length - 1]);
    }
  }, [coordinates]);

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

  const start = useCallback(async (): Promise<boolean> => {
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

  const startSimulation = useCallback(async (): Promise<boolean> => {
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

  const stop = useCallback(async () => {
    if (state !== 'tracking') return;

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
  }, [state, coordinates.length]);

  const reset = useCallback(async () => {
    cleanup();
    setCoordinates([]);
    setDistanceKm(0);
    setDurationSeconds(0);
    setCurrentLocation(null);
    setIsSimulating(false);
    startTimeRef.current = null;
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

    const isTaskRunning = await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
    if (isTaskRunning) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  };

  const getStartTime = useCallback(() => startTimeRef.current, []);

  return {
    state,
    coordinates,
    distanceKm,
    durationSeconds,
    currentLocation,
    permissionStatus,
    isSimulating,
    start,
    startSimulation,
    stop,
    reset,
    getStartTime,
    getCurrentPosition,
  };
}
