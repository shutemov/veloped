/**
 * Спека для растрового маркера (View → captureRef → tmpfile uri для expo-osm-sdk).
 * Не привязана к координате — только внешний вид круга с подписью.
 */
export type SegmentRasterSpec =
  | { kind: 'start'; n: number }
  | { kind: 'end'; n: number }
  | { kind: 'boundary'; finishN: number; startN: number }
  /** Один отрезок из одной точки (несколько отрезков в поездке). */
  | { kind: 'segmentPoint'; n: number }
  /** Вся поездка — одна GPS-точка. */
  | { kind: 'routePoint' };

export type LogicalMapMarker = {
  id: string;
  coordinate: { latitude: number; longitude: number };
  title: string;
  zIndex?: number;
  rasterSpec: SegmentRasterSpec;
};

export function segmentRasterSpecKey(spec: SegmentRasterSpec): string {
  switch (spec.kind) {
    case 'start':
      return `start:${spec.n}`;
    case 'end':
      return `end:${spec.n}`;
    case 'boundary':
      return `boundary:${spec.finishN}:${spec.startN}`;
    case 'segmentPoint':
      return `segPoint:${spec.n}`;
    case 'routePoint':
      return 'routePoint';
  }
}
