import type { Coordinate } from '../types';

const STEPS_PER_LEG = 8;

/** ~24–28 м — визуальный разрыв между отрезками на карте. */
const GAP_LAT = 0.00022;
const GAP_LON = 0.00018;

function legPoints(from: Coordinate, to: Coordinate, count: number, baseTime: number): Coordinate[] {
  const out: Coordinate[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    out.push({
      latitude: from.latitude + (to.latitude - from.latitude) * t,
      longitude: from.longitude + (to.longitude - from.longitude) * t,
      timestamp: baseTime + i * 1000,
    });
  }
  return out;
}

/**
 * Три отрезка для dev: между ними намеренные «разрывы» — конец отрезка N и начало N+1
 * в разных точках (не как при реальной паузе с дублем GPS), чтобы отрезки визуально
 * не сливались и первый выглядел обособленно.
 */
export function buildDemoRouteWithPauses(start: Coordinate): {
  coordinates: Coordinate[];
  segmentStartIndices: number[];
} {
  const dLat = 0.00012;
  const dLon = 0.00018;

  const O = { ...start };

  /** Отрезок 1: «остров» к северо-востоку от точки старта. */
  const seg1End = {
    ...start,
    latitude: start.latitude + dLat * 14,
    longitude: start.longitude + dLon * 10,
  };

  /**
   * Отрезок 2: начало НЕ в seg1End — скачок на юго-восток (зазор от конца первого).
   */
  const seg2Start = {
    ...start,
    latitude: seg1End.latitude + GAP_LAT * 0.4,
    longitude: seg1End.longitude - GAP_LON * 2.2,
  };
  const seg2End = {
    ...start,
    latitude: start.latitude + dLat * 4,
    longitude: start.longitude + dLon * 16,
  };

  /**
   * Отрезок 3: начало НЕ в seg2End — скачок (зазор от конца второго).
   */
  const seg3Start = {
    ...start,
    latitude: seg2End.latitude - GAP_LAT * 1.1,
    longitude: seg2End.longitude + GAP_LON * 0.9,
  };
  const seg3End = {
    ...start,
    latitude: start.latitude + dLat * 1.4,
    longitude: start.longitude + dLon * 1.1,
  };

  const t0 = Date.now();
  const stepMs = STEPS_PER_LEG * 1000;
  const leg1 = legPoints(O, seg1End, STEPS_PER_LEG, t0);
  const leg2 = legPoints(seg2Start, seg2End, STEPS_PER_LEG, t0 + stepMs);
  const leg3 = legPoints(seg3Start, seg3End, STEPS_PER_LEG, t0 + stepMs * 2);

  const coordinates = [...leg1, ...leg2, ...leg3];
  const segmentStartIndices = [leg1.length, leg1.length + leg2.length];

  return { coordinates, segmentStartIndices };
}
