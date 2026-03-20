import React from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { OSMView } from 'expo-osm-sdk';
import { useRides } from '../hooks/useRides';
import { formatDate, formatTime, formatDistance, formatDuration } from '../utils/formatters';

type RideDetailParams = {
  RideDetail: { rideId: string };
};

export function RideDetailScreen() {
  const route = useRoute<RouteProp<RideDetailParams, 'RideDetail'>>();
  const navigation = useNavigation();
  const { getRide, deleteRide } = useRides();

  const ride = getRide(route.params.rideId);

  if (!ride) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Поездка не найдена</Text>
      </View>
    );
  }

  const polylineCoords = ride.coordinates.map((c) => ({
    latitude: c.latitude,
    longitude: c.longitude,
  }));

  const centerLat =
    ride.coordinates.reduce((sum, c) => sum + c.latitude, 0) /
    ride.coordinates.length;
  const centerLon =
    ride.coordinates.reduce((sum, c) => sum + c.longitude, 0) /
    ride.coordinates.length;

  const handleDelete = () => {
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

  return (
    <ScrollView style={styles.container}>
      <View style={styles.mapContainer}>
        <OSMView
          style={styles.map}
          initialCenter={{ latitude: centerLat, longitude: centerLon }}
          initialZoom={16}
          polylines={
            polylineCoords.length > 1
              ? [
                  {
                    id: 'ride_route',
                    coordinates: polylineCoords,
                    strokeColor: '#4CAF50',
                    strokeWidth: 4,
                  },
                ]
              : []
          }
        />
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
            <Text style={styles.statValue}>{ride.coordinates.length}</Text>
            <Text style={styles.statLabel}>Точек GPS</Text>
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
});
