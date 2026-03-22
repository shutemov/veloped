import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Modal, Pressable } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OSMView, OSMViewRef } from 'expo-osm-sdk';
import { useRides } from '../hooks/useRides';
import { ShareGpxHeaderButton } from '../components/ShareGpxHeaderButton';
import { formatDate, formatTime, formatDistance, formatDuration } from '../utils/formatters';
import { shareSingleRideAsGpx, ShareGpxError } from '../utils/shareAllRidesGpx';

type RideDetailParams = {
  RideDetail: { rideId: string };
};

type RideDetailNavigationProp = NativeStackNavigationProp<RideDetailParams, 'RideDetail'>;

export function RideDetailScreen() {
  const route = useRoute<RouteProp<RideDetailParams, 'RideDetail'>>();
  const navigation = useNavigation<RideDetailNavigationProp>();
  const { getRide, deleteRide } = useRides();
  const [isPointsModalVisible, setIsPointsModalVisible] = React.useState(false);
  const [isMapReady, setIsMapReady] = React.useState(false);
  const [exportingGpx, setExportingGpx] = useState(false);
  const mapRef = useRef<OSMViewRef>(null);

  const ride = getRide(route.params.rideId);
  const rideCoordinates = ride?.coordinates ?? [];

  const normalizedCoords = useMemo(() => {
    const mapped = rideCoordinates
      .map((c, index) => ({
        latitude: Number(c.latitude),
        longitude: Number(c.longitude),
        timestamp: Number(c.timestamp),
        originalIndex: index,
      }))
      .filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude));

    return mapped.sort((a, b) => {
      const aHasTime = Number.isFinite(a.timestamp);
      const bHasTime = Number.isFinite(b.timestamp);
      if (aHasTime && bHasTime) {
        return a.timestamp - b.timestamp;
      }
      return a.originalIndex - b.originalIndex;
    });
  }, [rideCoordinates]);

  const polylineCoords = normalizedCoords.map((c) => ({
    latitude: c.latitude,
    longitude: c.longitude,
  }));

  const routeMarkers = useMemo(() => {
    if (normalizedCoords.length === 0) return [];
    const start = normalizedCoords[0];
    const end = normalizedCoords[normalizedCoords.length - 1];

    if (normalizedCoords.length === 1) {
      return [
        {
          id: 'single_point',
          coordinate: { latitude: start.latitude, longitude: start.longitude },
          title: 'Точка маршрута',
        },
      ];
    }

    return [
      {
        id: 'route_start',
        coordinate: { latitude: start.latitude, longitude: start.longitude },
        title: 'Старт',
      },
      {
        id: 'route_end',
        coordinate: { latitude: end.latitude, longitude: end.longitude },
        title: 'Финиш',
      },
    ];
  }, [normalizedCoords]);

  const routeRegion = useMemo(() => {
    if (normalizedCoords.length === 0) return null;

    const lats = normalizedCoords.map((c) => c.latitude);
    const lons = normalizedCoords.map((c) => c.longitude);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    const latitudeDelta = Math.max((maxLat - minLat) * 1.4, 0.0025);
    const longitudeDelta = Math.max((maxLon - minLon) * 1.4, 0.0025);

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta,
      longitudeDelta,
    };
  }, [normalizedCoords]);

  const routeZoom = useMemo(() => {
    if (!routeRegion) return 14;
    const maxDelta = Math.max(routeRegion.latitudeDelta, routeRegion.longitudeDelta);
    if (maxDelta > 0.2) return 10;
    if (maxDelta > 0.08) return 11;
    if (maxDelta > 0.04) return 12;
    if (maxDelta > 0.02) return 13;
    if (maxDelta > 0.01) return 14;
    if (maxDelta > 0.005) return 15;
    return 16;
  }, [routeRegion]);

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
