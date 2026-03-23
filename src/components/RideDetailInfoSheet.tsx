import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Animated,
  PanResponder,
  Pressable,
} from 'react-native';
type Props = {
  /** Высота шторки в развёрнутом виде (px). */
  expandedHeight: number;
  /** Контент под зоной перетаскивания (прокручивается в развёрнутом виде). */
  children: React.ReactNode;
  /** Сводка в свёрнутом виде (дистанция / время). */
  collapsedSummary: React.ReactNode;
};

export function RideDetailInfoSheet({
  expandedHeight,
  children,
  collapsedSummary,
}: Props) {
  /** Ручка + сводка + небольшой отступ над таббаром (экран уже над навигацией, без home inset снизу). */
  const collapsedHeight = 120;
  const maxHeight = Math.max(expandedHeight, collapsedHeight + 120);
  const collapsedOffset = maxHeight - collapsedHeight;

  const translateY = React.useRef(new Animated.Value(collapsedOffset)).current;
  const startOffsetRef = React.useRef(collapsedOffset);
  const currentOffsetRef = React.useRef(collapsedOffset);
  const [isCollapsed, setIsCollapsed] = React.useState(true);

  React.useEffect(() => {
    translateY.setValue(collapsedOffset);
    startOffsetRef.current = collapsedOffset;
    currentOffsetRef.current = collapsedOffset;
    setIsCollapsed(true);
  }, [translateY, maxHeight, collapsedOffset]);

  const clampOffset = React.useCallback(
    (offset: number) => Math.max(0, Math.min(collapsedOffset, offset)),
    [collapsedOffset]
  );

  const snapTo = React.useCallback(
    (targetOffset: number) => {
      Animated.spring(translateY, {
        toValue: targetOffset,
        useNativeDriver: true,
        friction: 8,
        tension: 90,
      }).start(() => {
        currentOffsetRef.current = targetOffset;
        setIsCollapsed(targetOffset >= collapsedOffset - 1);
      });
    },
    [translateY, collapsedOffset]
  );

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
        onPanResponderGrant: () => {
          translateY.stopAnimation((value) => {
            startOffsetRef.current = value;
            currentOffsetRef.current = value;
          });
        },
        onPanResponderMove: (_, g) => {
          const nextOffset = clampOffset(startOffsetRef.current + g.dy);
          translateY.setValue(nextOffset);
          currentOffsetRef.current = nextOffset;
        },
        onPanResponderRelease: (_, g) => {
          const vy = g.vy;
          const offset = currentOffsetRef.current;
          const mid = collapsedOffset / 2;
          let targetOffset = 0;
          if (vy > 0.85 || (vy > -0.35 && offset > mid)) {
            targetOffset = collapsedOffset;
          } else if (vy < -0.85 || offset <= mid) {
            targetOffset = 0;
          } else {
            targetOffset = offset > mid ? collapsedOffset : 0;
          }
          snapTo(targetOffset);
        },
      }),
    [clampOffset, translateY, collapsedOffset, snapTo]
  );

  return (
    <Animated.View
      style={[
        styles.sheet,
        {
          height: maxHeight,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={styles.sheetBody}>
        <View style={styles.dragZone} {...panResponder.panHandlers}>
          <View style={styles.handleHit}>
            <View
              style={styles.handleBar}
              accessibilityLabel="Потяните, чтобы свернуть или развернуть панель"
            />
          </View>
          {isCollapsed ? (
            <Pressable
              style={styles.collapsedRow}
              onPress={() => snapTo(0)}
              accessibilityRole="button"
              accessibilityLabel="Развернуть панель с деталями поездки"
            >
              {collapsedSummary}
            </Pressable>
          ) : null}
        </View>
        <View style={styles.sheetScrollWrap}>
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={[
              styles.sheetScrollContent,
              { paddingBottom: 12 },
            ]}
            scrollEnabled={!isCollapsed}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#f5f5f5',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 10,
    overflow: 'hidden',
  },
  sheetBody: {
    flex: 1,
    flexDirection: 'column',
  },
  sheetScrollWrap: {
    flex: 1,
    minHeight: 0,
  },
  dragZone: {
    flexShrink: 0,
  },
  handleHit: {
    paddingTop: 10,
    paddingBottom: 12,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cfd8dc',
  },
  collapsedRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  sheetScroll: {
    flex: 1,
    minHeight: 0,
  },
  sheetScrollContent: {
    flexGrow: 1,
    paddingTop: 4,
    paddingHorizontal: 16,
  },
});
