import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { formatDuration, formatDistance } from '../utils/formatters';

interface StatsBarProps {
  distanceKm: number;
  durationSeconds: number;
}

export function StatsBar({ distanceKm, durationSeconds }: StatsBarProps) {
  return (
    <View style={styles.container}>
      <View style={styles.stat}>
        <Text style={styles.value}>{formatDistance(distanceKm)}</Text>
        <Text style={styles.label}>Дистанция</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.stat}>
        <Text style={styles.value}>{formatDuration(durationSeconds)}</Text>
        <Text style={styles.label}>Время</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  value: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  divider: {
    width: 1,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 16,
  },
});
