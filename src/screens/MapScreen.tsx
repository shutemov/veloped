import React from 'react';
import {
  View,
  StyleSheet,
  Alert,
  Text,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OSMView, OSMViewRef } from 'expo-osm-sdk';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTracking } from '../hooks/useTracking';
import { useRides } from '../hooks/useRides';
import { StatsBar } from '../components/StatsBar';
import { TrackingButton } from '../components/TrackingButton';
import { calculateTotalDistance } from '../utils/haversine';
import { Coordinate, Ride } from '../types';

type MapScreenMarker =
  | { kind: 'device'; coordinate: Coordinate }
  | { kind: 'start'; coordinate: Coordinate }
  | { kind: 'finish'; coordinate: Coordinate };

function markerTitle(kind: MapScreenMarker['kind']): string {
  if (kind === 'device') return 'Моё местоположение';
  if (kind === 'start') return 'Старт';
  return 'Финиш';
}

/** Отступ FAB «моя позиция» от правого и нижнего края карты (px). Снизу плюс safe area. */
const LOCATE_FAB_INSET = 24;

export function MapScreen() {
  const insets = useSafeAreaInsets();
  const {
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
  } = useTracking();

  const { saveRide } = useRides();
  const cameraRef = React.useRef<OSMViewRef>(null);
  const [initialRegion, setInitialRegion] = React.useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [mapMarker, setMapMarker] = React.useState<MapScreenMarker | null>(null);
  const [isLocating, setIsLocating] = React.useState(false);
  const [isMapReady, setIsMapReady] = React.useState(false);
  const startMarkerPendingRef = React.useRef(false);
  const autoPersistedForStartTimeRef = React.useRef<number | null>(null);

  const animateToLocationSafe = React.useCallback(
    async (latitude: number, longitude: number) => {
      if (!cameraRef.current || !isMapReady) {
        return;
      }

      try {
        if (cameraRef.current.isViewReady) {
          const viewReady = await cameraRef.current.isViewReady();
          if (!viewReady) {
            return;
          }
        }

        await cameraRef.current.animateToLocation(latitude, longitude);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          message.includes('Map not ready') ||
          message.includes('style not loaded')
        ) {
          return;
        }
        console.error('Failed to animate map camera:', error);
      }
    },
    [isMapReady]
  );

  React.useEffect(() => {
    initializeLocation();
  }, []);

  React.useEffect(() => {
    if (state !== 'tracking') {
      startMarkerPendingRef.current = false;
    }
  }, [state]);

  // Во время записи: маркер старта на первой точке (в т.ч. после восстановления трека из AsyncStorage).
  const trackStart = coordinates[0];
  React.useEffect(() => {
    if (state !== 'tracking' || !trackStart) {
      return;
    }
    if (startMarkerPendingRef.current) {
      startMarkerPendingRef.current = false;
    }
    setMapMarker((m) => {
      if (m?.kind === 'finish') return m;
      return { kind: 'start', coordinate: trackStart };
    });
  }, [state, trackStart?.latitude, trackStart?.longitude]);

  // После «Стоп»: маркер только в точке финиша.
  React.useEffect(() => {
    if (state === 'finished' && coordinates.length > 0) {
      setMapMarker({
        kind: 'finish',
        coordinate: coordinates[coordinates.length - 1],
      });
    }
  }, [state, coordinates]);

  // Сохранение/сброс: убираем старт/финиш; маркер «устройство» не трогаем при пустом треке в idle.
  React.useEffect(() => {
    if (state === 'idle' && coordinates.length === 0) {
      setMapMarker((m) =>
        m?.kind === 'start' || m?.kind === 'finish' ? null : m
      );
    }
  }, [state, coordinates.length]);

  React.useEffect(() => {
    if (currentLocation && state === 'tracking' && cameraRef.current) {
      void animateToLocationSafe(
        currentLocation.latitude,
        currentLocation.longitude
      );
    }
  }, [animateToLocationSafe, currentLocation, state]);

  React.useEffect(() => {
    if (state === 'idle') {
      autoPersistedForStartTimeRef.current = null;
    }
    if (state !== 'finished') {
      return;
    }

    const startTime = getStartTime();
    if (startTime == null || coordinates.length === 0) {
      void reset();
      return;
    }

    if (autoPersistedForStartTimeRef.current === startTime) {
      return;
    }
    autoPersistedForStartTimeRef.current = startTime;

    const run = async () => {
      const ride: Ride = {
        id: `ride_${startTime}`,
        startTime,
        endTime: Date.now(),
        durationSeconds: Math.max(0, Math.floor((Date.now() - startTime) / 1000)),
        distanceKm: calculateTotalDistance(coordinates),
        coordinates,
        source: 'recorded',
      };

      try {
        await saveRide(ride);
        Alert.alert('Готово', 'Поездка сохранена в истории.', [{ text: 'OK' }]);
      } catch {
        Alert.alert('Ошибка', 'Не удалось сохранить поездку.', [{ text: 'OK' }]);
      } finally {
        await reset();
        autoPersistedForStartTimeRef.current = null;
      }
    };

    void run();
  }, [state, coordinates, getStartTime, saveRide, reset]);

  const initializeLocation = async () => {
    const location = await getCurrentPosition();
    if (location) {
      setInitialRegion({
        latitude: location.latitude,
        longitude: location.longitude,
      });
    }
  };

  /** Центр карты на реальном GPS; маркер «устройство» только в idle (не затираем старт/финиш). */
  const handleLocateMe = async () => {
    if (isLocating) return;
    try {
      setIsLocating(true);
      const location = await getCurrentPosition();
      if (!location) {
        Alert.alert('Ошибка', 'Не удалось получить местоположение');
        return;
      }

      if (state === 'idle') {
        setMapMarker({ kind: 'device', coordinate: location });
      }
      void animateToLocationSafe(location.latitude, location.longitude);
    } catch (error) {
      console.error('Failed to show device location:', error);
      Alert.alert('Ошибка', 'Не удалось получить местоположение');
    } finally {
      setIsLocating(false);
    }
  };

  const handleStart = async () => {
    setMapMarker(null);
    startMarkerPendingRef.current = true;
    const success = await start();
    if (!success) {
      startMarkerPendingRef.current = false;
      Alert.alert(
        'Ошибка',
        'Не удалось начать запись. Проверьте разрешения на геолокацию.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleStartDemo = async () => {
    setMapMarker(null);
    startMarkerPendingRef.current = true;
    const success = await startSimulation();
    if (!success) {
      startMarkerPendingRef.current = false;
      Alert.alert('Демо недоступно', 'Остановите текущий трек или сбросьте запись.');
    }
  };

  const handleStop = () => {
    stop();
  };

  const polylineCoords = coordinates.map((c) => ({
    latitude: c.latitude,
    longitude: c.longitude,
  }));

  if (!initialRegion) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Определение местоположения...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <OSMView
        ref={cameraRef}
        style={styles.map}
        initialCenter={initialRegion}
        initialZoom={16}
        onMapReady={() => setIsMapReady(true)}
        markers={
          mapMarker
            ? [
                {
                  id: 'map-marker',
                  coordinate: {
                    latitude: mapMarker.coordinate.latitude,
                    longitude: mapMarker.coordinate.longitude,
                  },
                  title: markerTitle(mapMarker.kind),
                },
              ]
            : []
        }
        polylines={
          polylineCoords.length > 1
            ? [
                {
                  id: 'route',
                  coordinates: polylineCoords,
                  strokeColor: '#4CAF50',
                  strokeWidth: 4,
                },
              ]
            : []
        }
      />

      <View style={styles.overlay}>
        <StatsBar
          distanceKm={distanceKm}
          durationSeconds={durationSeconds}
          topInset={insets.top}
        />
      </View>

      <View
        style={[
          styles.locateFabWrap,
          {
            right: LOCATE_FAB_INSET,
            bottom: LOCATE_FAB_INSET,
          },
        ]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={handleLocateMe}
          disabled={permissionStatus === 'denied' || isLocating}
          style={({ pressed }) => [
            styles.locateFab,
            (permissionStatus === 'denied' || isLocating) && styles.locateFabDisabled,
            pressed &&
              permissionStatus !== 'denied' &&
              !isLocating &&
              styles.locateFabPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Показать моё местоположение на карте"
        >
          {isLocating ? (
            <ActivityIndicator size="small" color="#1976D2" />
          ) : (
            <Ionicons name="locate" size={26} color="#1976D2" />
          )}
        </Pressable>
      </View>

      <View style={[styles.buttonContainer, { bottom: 24 + insets.bottom }]}>
        {__DEV__ && (
          <TouchableOpacity
            style={[
              styles.demoButton,
              (state !== 'idle' || permissionStatus === 'denied') && styles.disabled,
            ]}
            onPress={handleStartDemo}
            disabled={state !== 'idle' || permissionStatus === 'denied'}
          >
            <Text style={styles.demoButtonText}>
              {isSimulating ? 'Демо выполняется...' : 'Запустить демо-маршрут'}
            </Text>
          </TouchableOpacity>
        )}
        <TrackingButton
          state={state}
          onStart={handleStart}
          onStop={handleStop}
          disabled={permissionStatus === 'denied'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  locateFabWrap: {
    position: 'absolute',
    zIndex: 2,
  },
  locateFab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 3,
  },
  locateFabPressed: {
    opacity: 0.88,
  },
  locateFabDisabled: {
    opacity: 0.45,
  },
  demoButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: '#6A5ACD',
    marginBottom: 12,
    minWidth: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  disabled: {
    backgroundColor: '#ccc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
});
