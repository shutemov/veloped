import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { TrackingState } from '../types';

interface TrackingButtonProps {
  state: TrackingState;
  onStart: () => void;
  onStop: () => void;
  onSave: () => void;
  onDiscard: () => void;
  disabled?: boolean;
}

export function TrackingButton({
  state,
  onStart,
  onStop,
  onSave,
  onDiscard,
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
    <View style={styles.finishedContainer}>
      <TouchableOpacity
        style={[styles.button, styles.discardButton]}
        onPress={onDiscard}
      >
        <Text style={styles.discardText}>Удалить</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, styles.saveButton]}
        onPress={onSave}
      >
        <Text style={styles.buttonText}>Сохранить</Text>
      </TouchableOpacity>
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
  saveButton: {
    backgroundColor: '#4CAF50',
  },
  discardButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#f44336',
  },
  disabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  discardText: {
    color: '#f44336',
    fontSize: 18,
    fontWeight: '600',
  },
  finishedContainer: {
    flexDirection: 'row',
    gap: 16,
  },
});
