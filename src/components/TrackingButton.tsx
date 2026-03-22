import React from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { TrackingState } from '../types';

interface TrackingButtonProps {
  state: TrackingState;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
}

export function TrackingButton({
  state,
  onStart,
  onStop,
  disabled,
}: TrackingButtonProps) {
  if (state === 'idle') {
    return (
      <TouchableOpacity
        style={[styles.button, styles.startButton, disabled && styles.disabled]}
        onPress={onStart}
        disabled={disabled}
      >
        <Text style={styles.buttonText}>Старт</Text>
      </TouchableOpacity>
    );
  }

  if (state === 'tracking') {
    return (
      <TouchableOpacity
        style={[styles.button, styles.stopButton]}
        onPress={onStop}
      >
        <Text style={styles.buttonText}>Стоп</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.button, styles.savingButton]} accessibilityRole="progressbar">
      <ActivityIndicator color="#4CAF50" style={styles.savingSpinner} />
      <Text style={styles.savingText}>Сохраняем в историю…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 140,
  },
  startButton: {
    backgroundColor: '#4CAF50',
  },
  stopButton: {
    backgroundColor: '#f44336',
  },
  savingButton: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#4CAF50',
    minWidth: 240,
    paddingHorizontal: 24,
  },
  savingSpinner: {
    marginRight: 10,
  },
  savingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2E7D32',
  },
  disabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
