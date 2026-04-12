import type { Coordinate } from '../types';

/** Цвета отрезков по порядку (после паузы / «Продолжить»). */
export const RIDE_SEGMENT_STROKE_COLORS = [
  '#4CAF50',
  '#2196F3',
  '#FF9800',
  '#9C27B0',
  '#00BCD4',
  '#E91E63',
  '#795548',
  '#607D8B',
];

export type SampledWithOriginalIndex = { coord: Coordinate; originalIndex: number };

/**
 * Та же логика прореживания, что на экране деталей поездки (detail step).
 */
export function sampleCoordinatesWithOriginalIndex(
  coords: Coordinate[],
  detailStep: number
): SampledWithOriginalIndex[] {
  if (coords.length === 0) return [];
  if (detailStep <= 1) {
    return coords.map((coord, originalIndex) => ({ coord, originalIndex }));
  }
  const out: SampledWithOriginalIndex[] = [];
  for (let index = 0; index < coords.length; index += detailStep) {
    out.push({ coord: coords[index], originalIndex: index });
  }
  const lastPoint = coords[coords.length - 1];
  if (lastPoint && out[out.length - 1]?.coord !== lastPoint) {
    out.push({ coord: lastPoint, originalIndex: coords.length - 1 });
  }
  return out;
}

/**
 * Индексы начала 2-го, 3-го, … отрезка в массиве coordinates (после «Продолжить»).
 * Первый отрезок всегда с индекса 0.
 */
export function splitCoordinatesIntoSegments(
  coordinates: Coordinate[],
  segmentStartIndices?: number[] | null
): Coordinate[][] {
  if (coordinates.length === 0) return [];
  const raw = segmentStartIndices?.filter((i) => Number.isFinite(i) && i > 0 && i < coordinates.length) ?? [];
  const sortedStarts = [...new Set(raw)].sort((a, b) => a - b);
  if (sortedStarts.length === 0) return [coordinates];

  const starts = [0, ...sortedStarts];
  const segments: Coordinate[][] = [];
  for (let i = 0; i < starts.length; i++) {
    const a = starts[i];
    const b = i + 1 < starts.length ? starts[i + 1]! : coordinates.length;
    if (a < b) {
      segments.push(coordinates.slice(a, b));
    }
  }
  return segments.filter((s) => s.length > 0);
}

/**
 * Для карты записи: массив полилиний с цветом по отрезку.
 */
export function buildMapPolylinesFromSegments(
  coordinates: Coordinate[],
  segmentStartIndices?: number[] | null
): { id: string; coordinates: { latitude: number; longitude: number }[]; strokeColor: string; strokeWidth: number }[] {
  const segments = splitCoordinatesIntoSegments(coordinates, segmentStartIndices);
  return segments
    .map((seg, i) => ({
      id: `route-seg-${i}`,
      coordinates: seg.map((c) => ({ latitude: c.latitude, longitude: c.longitude })),
      strokeColor: RIDE_SEGMENT_STROKE_COLORS[i % RIDE_SEGMENT_STROKE_COLORS.length]!,
      strokeWidth: 4,
    }))
    .filter((p) => p.coordinates.length > 1);
}

/**
 * Для экрана деталей: прореженные точки с привязкой к исходному индексу → отрезки для полилиний.
 */
export function buildDetailSegmentPolylines(
  fullCoordinates: Coordinate[],
  segmentStartIndices: number[] | undefined,
  detailStep: number
): { id: string; coordinates: { latitude: number; longitude: number }[]; strokeColor: string; strokeWidth: number }[] {
  const sampled = sampleCoordinatesWithOriginalIndex(fullCoordinates, detailStep);
  if (sampled.length < 2) return [];

  const starts = segmentStartIndices?.filter((i) => i > 0 && i < fullCoordinates.length) ?? [];
  if (starts.length === 0) {
    return [
      {
        id: 'ride_route_seg_0',
        coordinates: sampled.map((s) => ({ latitude: s.coord.latitude, longitude: s.coord.longitude })),
        strokeColor: RIDE_SEGMENT_STROKE_COLORS[0]!,
        strokeWidth: 6,
      },
    ];
  }

  const sortedStarts = [...new Set(starts)].sort((a, b) => a - b);
  const boundaries = [0, ...sortedStarts];
  const polylines: {
    id: string;
    coordinates: { latitude: number; longitude: number }[];
    strokeColor: string;
    strokeWidth: number;
  }[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const lo = boundaries[i]!;
    const hi = i + 1 < boundaries.length ? boundaries[i + 1]! - 1 : fullCoordinates.length - 1;
    const segPoints = sampled.filter((s) => s.originalIndex >= lo && s.originalIndex <= hi);
    const coordinates = segPoints.map((s) => ({
      latitude: s.coord.latitude,
      longitude: s.coord.longitude,
    }));
    if (coordinates.length > 1) {
      polylines.push({
        id: `ride_route_seg_${i}`,
        coordinates,
        strokeColor: RIDE_SEGMENT_STROKE_COLORS[i % RIDE_SEGMENT_STROKE_COLORS.length]!,
        strokeWidth: 6,
      });
    }
  }

  return polylines;
}
