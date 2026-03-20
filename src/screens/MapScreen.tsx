import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Alert, Text, TouchableOpacity } from 'react-native';
import { OSMView, OSMViewRef } from 'expo-osm-sdk';
import { useTracking } from '../hooks/useTracking';
import { useRides } from '../hooks/useRides';
import { StatsBar } from '../components/StatsBar';
import { TrackingButton } from '../components/TrackingButton';
import { Coordinate, Ride } from '../types';

export function MapScreen() {
  const {
    state,
    coordinates,
    distanceKm,
    durationSeconds,
    currentLocation,
    permissionStatus,
    start,
    stop,
    reset,
    getStartTime,
    getCurrentPosition,
  } = useTracking();

  const { saveRide } = useRides();
  const cameraRef = useRef<OSMViewRef>(null);
  const [initialRegion, setInitialRegion] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [deviceLocation, setDeviceLocation] = useState<Coordinate | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    initializeLocation();
  }, []);

  // Во время трекинга маркер ведём за текущей позицией из фонового/foreground обновления.
  useEffect(() => {
    if (currentLocation && state === 'tracking') {
      setDeviceLocation(currentLocation);
    }
  }, [currentLocation, state]);

  useEffect(() => {
    if (currentLocation && state === 'tracking' && cameraRef.current) {
      void cameraRef.current.animateToLocation(
        currentLocation.latitude,
        currentLocation.longitude
      );
    }
  }, [currentLocation, state]);

  const initializeLocation = async () => {
    const location = await getCurrentPosition();
    if (location) {
      setInitialRegion({
        latitude: location.latitude,
        longitude: location.longitude,
      });
    }
  };

  const handleShowDevice = async () => {
    if (isLocating) return;
    try {
      setIsLocating(true);
      const location = await getCurrentPosition();
      if (!location) {
        Alert.alert('Ошибка', 'Не удалось получить местоположение');
        return;
      }

      setDeviceLocation(location);
      if (cameraRef.current) {
        void cameraRef.current.animateToLocation(location.latitude, location.longitude);
      }
    } catch (error) {
      console.error('Failed to show device location:', error);
      Alert.alert('Ошибка', 'Не удалось получить местоположение');
    } finally {
      setIsLocating(false);
    }
  };

  const handleStart = async () => {
    const success = await start();
    if (!success) {
      Alert.alert(
        'Ошибка',
        'Не удалось начать запись. Проверьте разрешения на геолокацию.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleStop = () => {
    stop();
  };

  const handleSave = async () => {
    const startTime = getStartTime();
    if (!startTime || coordinates.length === 0) {
      reset();
      return;
    }

    const ride: Ride = {
      id: `ride_${startTime}`,
      startTime,
      endTime: Date.now(),
      durationSeconds,
      distanceKm,
      coordinates,
    };

    try {
      await saveRide(ride);
      Alert.alert('Готово', 'Поездка сохранена!', [{ text: 'OK' }]);
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось сохранить поездку.', [{ text: 'OK' }]);
    }

    reset();
  };

  const handleDiscard = () => {
    Alert.alert(
      'Удалить поездку?',
      'Данные этой поездки будут потеряны.',
      [
        { text: 'Отмена', style: 'cancel' },
        { text: 'Удалить', style: 'destructive', onPress: () => reset() },
      ]
    );
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
        markers={
          deviceLocation
            ? [
                {
                  id: 'device',
                  coordinate: {
                    latitude: deviceLocation.latitude,
                    longitude: deviceLocation.longitude,
                  },
                  title: 'Моё местоположение',
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
        <StatsBar distanceKm={distanceKm} durationSeconds={durationSeconds} />
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.deviceButton,
            (permissionStatus === 'denied' || isLocating) && styles.disabled,
          ]}
          onPress={handleShowDevice}
          disabled={permissionStatus === 'denied' || isLocating}
        >
          <Text style={styles.deviceButtonText}>Показать устройство</Text>
        </TouchableOpacity>
        <TrackingButton
          state={state}
          onStart={handleStart}
          onStop={handleStop}
          onSave={handleSave}
          onDiscard={handleDiscard}
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
  deviceButton: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 32,
    backgroundColor: '#2196F3',
    marginBottom: 16,
    minWidth: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceButtonText: {
    color: '#fff',
    fontSize: 16,
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
