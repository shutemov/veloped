import React from 'react';
import { Pressable, ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type ShareGpxHeaderButtonProps = {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel: string;
};

export function ShareGpxHeaderButton({
  onPress,
  disabled,
  loading,
  accessibilityLabel,
}: ShareGpxHeaderButtonProps) {
  const isDisabled = Boolean(disabled || loading);
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.hit,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.inner}>
        {loading ? (
          <ActivityIndicator color="#4CAF50" size="small" />
        ) : (
          <Ionicons name="share-outline" size={24} color="#4CAF50" />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 44,
    minHeight: 44,
  },
  inner: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 36,
    height: 36,
  },
  disabled: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.65,
  },
});
