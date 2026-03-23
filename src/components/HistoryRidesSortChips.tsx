import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import type { RideListSortMode } from '../utils/sortRidesForList';

type Props = {
  sortMode: RideListSortMode;
  onSortModeChange: (mode: RideListSortMode) => void;
};

export function HistoryRidesSortChips({ sortMode, onSortModeChange }: Props) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onSortModeChange('date')}
        style={[styles.chip, sortMode === 'date' && styles.chipActive]}
        accessibilityRole="button"
        accessibilityState={{ selected: sortMode === 'date' }}
      >
        <Text
          style={[styles.chipText, sortMode === 'date' && styles.chipTextActive]}
        >
          Сначала новые
        </Text>
      </Pressable>
      <Pressable
        onPress={() => onSortModeChange('distance')}
        style={[styles.chip, sortMode === 'distance' && styles.chipActive]}
        accessibilityRole="button"
        accessibilityState={{ selected: sortMode === 'distance' }}
      >
        <Text
          style={[
            styles.chipText,
            sortMode === 'distance' && styles.chipTextActive,
          ]}
        >
          По длине
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: '#f5f5f5',
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  chipActive: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  chipTextActive: {
    color: '#2E7D32',
  },
});
