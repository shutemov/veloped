import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Animated,
  PanResponder,
  Pressable,
} from 'react-native';
const HANDLE_AREA_HEIGHT = 44;
const DEFAULT_COLLAPSED_SUMMARY_HEIGHT = 64;

type Props = {
  /** Высота шторки в развёрнутом виде (px). */
  expandedHeight: number;
  /** Контент под зоной перетаскивания (прокручивается в развёрнутом виде). */
  children: React.ReactNode;
  /** Сводка в свёрнутом виде (дистанция / время). */
  collapsedSummary: React.ReactNode;
};
type SheetState = 'collapsed' | 'expanded';

export function RideDetailInfoSheet({
  expandedHeight,
  children,
  collapsedSummary,
}: Props) {
  const [collapsedSummaryHeight, setCollapsedSummaryHeight] = React.useState(
    DEFAULT_COLLAPSED_SUMMARY_HEIGHT
  );
  /** Ручка + сводка. */
  const collapsedHeight = HANDLE_AREA_HEIGHT + collapsedSummaryHeight;
  const maxHeight = Math.max(expandedHeight, collapsedHeight + 120);
  const collapsedOffset = maxHeight - collapsedHeight;

  const translateY = React.useRef(new Animated.Value(collapsedOffset)).current;
  const summaryOpacity = React.useRef(new Animated.Value(1)).current;
  const contentOpacity = React.useRef(new Animated.Value(0)).current;
  const startOffsetRef = React.useRef(collapsedOffset);
  const currentOffsetRef = React.useRef(collapsedOffset);
  const [sheetState, setSheetState] = React.useState<SheetState>('collapsed');

  React.useEffect(() => {
    translateY.setValue(collapsedOffset);
    summaryOpacity.setValue(1);
    contentOpacity.setValue(0);
    startOffsetRef.current = collapsedOffset;
    currentOffsetRef.current = collapsedOffset;
    setSheetState('collapsed');
  }, [translateY, summaryOpacity, contentOpacity, maxHeight, collapsedOffset]);

  const clampOffset = React.useCallback(
    (offset: number) => Math.max(0, Math.min(collapsedOffset, offset)),
    [collapsedOffset]
  );

  const animateUiState = React.useCallback(
    (nextState: SheetState) => {
      Animated.parallel([
        Animated.timing(summaryOpacity, {
          toValue: nextState === 'collapsed' ? 1 : 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: nextState === 'expanded' ? 1 : 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [summaryOpacity, contentOpacity]
  );

  const snapTo = React.useCallback(
    (targetOffset: number) => {
      const nextState: SheetState =
        targetOffset >= collapsedOffset - 1 ? 'collapsed' : 'expanded';
      setSheetState(nextState);
      animateUiState(nextState);
      Animated.spring(translateY, {
        toValue: targetOffset,
        useNativeDriver: true,
        friction: 9,
        tension: 125,
      }).start(() => {
        currentOffsetRef.current = targetOffset;
      });
    },
    [translateY, collapsedOffset, animateUiState]
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
          <Animated.View
            style={[
              styles.collapsedRowWrap,
              {
                opacity: summaryOpacity,
                top: HANDLE_AREA_HEIGHT,
              },
            ]}
            pointerEvents={sheetState === 'collapsed' ? 'auto' : 'none'}
          >
            <Pressable
              style={styles.collapsedRow}
              onLayout={(event) => {
                const nextHeight = Math.ceil(event.nativeEvent.layout.height);
                if (nextHeight > 0) {
                  setCollapsedSummaryHeight((prev) => (prev === nextHeight ? prev : nextHeight));
                }
              }}
              onPress={() => snapTo(0)}
              accessibilityRole="button"
              accessibilityLabel="Развернуть панель с деталями поездки"
            >
              {collapsedSummary}
            </Pressable>
          </Animated.View>
        </View>
        <Animated.View
          style={[styles.sheetScrollWrap, { opacity: contentOpacity }]}
          pointerEvents={sheetState === 'expanded' ? 'auto' : 'none'}
        >
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={[
              styles.sheetScrollContent,
              { paddingBottom: 12 },
            ]}
            scrollEnabled={sheetState === 'expanded'}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {children}
          </ScrollView>
        </Animated.View>
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
    position: 'relative',
    minHeight: HANDLE_AREA_HEIGHT,
    zIndex: 1,
  },
  handleHit: {
    paddingTop: 6,
    paddingBottom: 6,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cfd8dc',
  },
  collapsedRowWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    overflow: 'hidden',
    zIndex: 2,
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
    paddingTop: 0,
    paddingHorizontal: 16,
  },
});
