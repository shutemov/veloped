import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ride } from '../types';
import { formatDate, formatTime, formatDistance, formatDuration } from '../utils/formatters';
import { importKindLabel } from '../utils/rideSource';

interface ImportedRideCardProps {
  ride: Ride;
  onPress: () => void;
}

export function ImportedRideCard({ ride, onPress }: ImportedRideCardProps) {
  const appName = ride.sourceAppName?.trim() || 'Неизвестное приложение';
  const deviceLabel = ride.sourceDeviceLabel?.trim() || 'Неизвестное устройство';
  const importedAt = ride.importedAt;
  const kindText = importKindLabel(ride.importKind);

  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <View style={styles.provenanceBlock}>
        <Text style={styles.appName} numberOfLines={1}>
          {appName}
        </Text>
        <Text style={styles.deviceLabel} numberOfLines={2}>
          {deviceLabel}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Импорт</Text>
          <Text style={styles.metaValue}>
            {importedAt != null && Number.isFinite(importedAt)
              ? `${formatDate(importedAt)} ${formatTime(importedAt)}`
              : '—'}
          </Text>
        </View>
        <View style={styles.kindBadge}>
          <Text style={styles.kindText}>{kindText}</Text>
        </View>
      </View>

      <View style={styles.trackHeader}>
        <Text style={styles.trackTitle}>Маршрут</Text>
        <Text style={styles.trackDate}>
          {formatDate(ride.startTime)} · {formatTime(ride.startTime)}
        </Text>
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
    borderWidth: 1,
    borderColor: '#e8e8e8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  provenanceBlock: {
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  appName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  deviceLabel: {
    fontSize: 14,
    color: '#555',
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  metaLabel: {
    fontSize: 12,
    color: '#888',
  },
  metaValue: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  kindBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  kindText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2E7D32',
  },
  trackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  trackTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  trackDate: {
    fontSize: 12,
    color: '#888',
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
