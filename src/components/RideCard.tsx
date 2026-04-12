import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ride } from '../types';
import { formatDate, formatTime, formatDistance, formatDuration } from '../utils/formatters';

interface RideCardProps {
  ride: Ride;
  onPress: () => void;
  /** Долгое нажатие — например, меню действий в списке истории. */
  onLongPress?: () => void;
}

export function RideCard({ ride, onPress, onLongPress }: RideCardProps) {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={450}
    >
      <View style={styles.header}>
        <Text style={styles.date}>{formatDate(ride.startTime)}</Text>
        <Text style={styles.time}>{formatTime(ride.startTime)}</Text>
      </View>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatDistance(ride.distanceKm)}</Text>
          <Text style={styles.statLabel}>Дистанция</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatDuration(ride.durationSeconds)}</Text>
          <Text style={styles.statLabel}>Время</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{ride.coordinates.length}</Text>
          <Text style={styles.statLabel}>Точек</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  date: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  time: {
    fontSize: 14,
    color: '#666',
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4CAF50',
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
});
