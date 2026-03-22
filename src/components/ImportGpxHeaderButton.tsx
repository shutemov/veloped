import React from 'react';
import { Pressable, ActivityIndicator, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type ImportGpxHeaderButtonProps = {
  onPress: () => void;
  loading?: boolean;
  accessibilityLabel: string;
};

export function ImportGpxHeaderButton({
  onPress,
  loading,
  accessibilityLabel,
}: ImportGpxHeaderButtonProps) {
  const isDisabled = Boolean(loading);
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
          <ActivityIndicator color="#2E7D32" size="small" />
        ) : (
          <Ionicons name="document-attach-outline" size={24} color="#2E7D32" />
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
