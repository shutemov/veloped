import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

/** Обводка и разделитель — один стиль, без «белых» подложек у колонок. */
const STATS_BAR_BORDER = 'rgba(0, 0, 0, 0.1)';
import { formatDuration, formatDistance } from '../utils/formatters';

interface StatsBarProps {
  distanceKm: number;
  durationSeconds: number;
  topInset?: number;
}

export function StatsBar({ distanceKm, durationSeconds, topInset = 0 }: StatsBarProps) {
  return (
    <View style={[styles.container, { marginTop: 8 + topInset }]}>
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
    backgroundColor: 'rgba(250, 250, 250, 0.8)',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: STATS_BAR_BORDER,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    // elevation с полупрозрачным фоном даёт на Android белую «подушку» под дочерними блоками
    elevation: Platform.OS === 'android' ? 0 : 4,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'transparent',
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
    alignSelf: 'stretch',
    backgroundColor: STATS_BAR_BORDER,
    marginVertical: 4,
    marginHorizontal: 12,
  },
});
