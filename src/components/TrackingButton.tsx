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
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  canPause?: boolean;
  disabled?: boolean;
}

export function TrackingButton({
  state,
  onStart,
  onPause,
  onResume,
  onStop,
  canPause = true,
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
      <View style={styles.row}>
        {canPause && (
          <TouchableOpacity style={[styles.button, styles.pauseButton]} onPress={onPause}>
            <Text style={styles.buttonText}>Пауза</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.button, styles.stopButton]} onPress={onStop}>
          <Text style={styles.buttonText}>Стоп</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (state === 'paused') {
    return (
      <View style={styles.row}>
        <TouchableOpacity style={[styles.button, styles.resumeButton]} onPress={onResume}>
          <Text style={styles.buttonText}>Продолжить</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.stopButton]} onPress={onStop}>
          <Text style={styles.buttonText}>Стоп</Text>
        </TouchableOpacity>
      </View>
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
    paddingHorizontal: 32,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 130,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  startButton: {
    backgroundColor: '#4CAF50',
  },
  pauseButton: {
    backgroundColor: '#FF9800',
  },
  resumeButton: {
    backgroundColor: '#2E7D32',
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
