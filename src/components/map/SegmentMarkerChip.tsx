import React from 'react';
import { View, Text, StyleSheet, PixelRatio } from 'react-native';
import type { SegmentRasterSpec } from '../../types/segmentMarkers';

export const SEGMENT_MARKER_VIEW_SIZE = 112;
export const SEGMENT_MARKER_CAPTURE_SIZE = Math.round(SEGMENT_MARKER_VIEW_SIZE * PixelRatio.get());

type Props = {
  spec: SegmentRasterSpec;
};

/** Круг с подписями — снимается ViewShot’ом в растровый uri для карты. */
export function SegmentMarkerChip({ spec }: Props) {
  const visual = React.useMemo(() => {
    switch (spec.kind) {
      case 'start':
        return {
          bg: '#1E88E5',
          line1: 'Старт',
          line2: `#${spec.n}`,
        };
      case 'end':
        return {
          bg: '#EF5350',
          line1: 'Финиш',
          line2: `#${spec.n}`,
        };
      case 'boundary':
        return {
          bg: '#795548',
          line1: `Ф#${spec.finishN}`,
          line2: `С#${spec.startN}`,
        };
      case 'segmentPoint':
        return {
          bg: '#00ACC1',
          line1: 'Отрезок',
          line2: `#${spec.n}`,
        };
      case 'routePoint':
        return {
          bg: '#00ACC1',
          line1: 'Точка',
          line2: 'маршрута',
        };
    }
  }, [spec]);

  return (
    <View
      style={[
        styles.circle,
        {
          width: SEGMENT_MARKER_VIEW_SIZE,
          height: SEGMENT_MARKER_VIEW_SIZE,
          borderRadius: SEGMENT_MARKER_VIEW_SIZE / 2,
          backgroundColor: visual.bg,
        },
      ]}
      collapsable={false}
    >
      <Text style={styles.line1} numberOfLines={1}>
        {visual.line1}
      </Text>
      <Text style={styles.line2} numberOfLines={1}>
        {visual.line2}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    borderWidth: 3,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  line1: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  line2: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
  },
});
