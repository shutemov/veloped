import { Coordinate } from '../types';

const GRAVITY_MS2 = 9.80665;

/** Speed decay per step (~100ms) -- предотвращает бесконечное движение при потере GPS. */
const SPEED_DECAY = 0.998;

/** Порог ZUPT: отклонение от g (м/с²) для определения покоя. */
const ZUPT_ACCEL_THRESHOLD = 0.3;

/** Порог ZUPT: угловая скорость вокруг Z (рад/с). */
const ZUPT_GYRO_THRESHOLD = 0.05;

/** Минимальное количество точек для вычисления скорости и курса. */
const MIN_POINTS_FOR_SPEED = 2;

/** Максимальная скорость м/с (≈ 79 км/ч) -- ограничитель здравомыслия. */
const MAX_SPEED_MS = 22;

const METERS_PER_LAT = 111_320;

export interface BridgeState {
  /** Якорная точка -- последний reliable GPS-фикс. */
  anchorLat: number;
  anchorLon: number;
  /** Оценка скорости из последних GPS-точек (м/с). */
  speedMs: number;
  /** Курс движения (рад), обновляется гироскопом. */
  headingRad: number;
  /** Смещение от якоря на север (м). */
  metersNorth: number;
  /** Смещение от якоря на восток (м). */
  metersEast: number;
  lastTimestampMs: number | null;
}

/**
 * Вычислить bearing (курс) между двумя координатами в радианах.
 * Результат: 0 = север, π/2 = восток.
 */
function bearingRad(from: Coordinate, to: Coordinate): number {
  const lat1 = (from.latitude * Math.PI) / 180;
  const lat2 = (to.latitude * Math.PI) / 180;
  const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;
  return Math.atan2(
    Math.sin(dLon) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  );
}

/**
 * Расстояние между двумя координатами в метрах (Haversine, упрощённый вариант).
 */
function distanceMeters(a: Coordinate, b: Coordinate): number {
  const R = 6_371_000;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLon = Math.sin(dLon / 2);
  const chord =
    sinHalfLat * sinHalfLat + Math.cos(lat1) * Math.cos(lat2) * sinHalfLon * sinHalfLon;
  return 2 * R * Math.atan2(Math.sqrt(chord), Math.sqrt(1 - chord));
}

function metersToLatLon(
  anchorLat: number,
  anchorLon: number,
  metersNorth: number,
  metersEast: number
): { latitude: number; longitude: number } {
  const metersPerLon = METERS_PER_LAT * Math.cos((anchorLat * Math.PI) / 180);
  return {
    latitude: anchorLat + metersNorth / METERS_PER_LAT,
    longitude: anchorLon + metersEast / (metersPerLon || 1),
  };
}

/**
 * Создать начальное состояние моста из последних reliable GPS-точек.
 * Использует 3-5 последних точек для оценки скорости и курса.
 */
export function createBridgeState(recentCoords: Coordinate[]): BridgeState {
  const anchor = recentCoords[recentCoords.length - 1];

  if (recentCoords.length < MIN_POINTS_FOR_SPEED) {
    return {
      anchorLat: anchor.latitude,
      anchorLon: anchor.longitude,
      speedMs: 0,
      headingRad: 0,
      metersNorth: 0,
      metersEast: 0,
      lastTimestampMs: anchor.timestamp,
    };
  }

  // Берём последние 2 точки для курса и последние N для скорости
  const prev = recentCoords[recentCoords.length - 2];
  const heading = bearingRad(prev, anchor);

  // Скорость усредняется по доступным точкам (до 4 пар)
  const pairsCount = Math.min(recentCoords.length - 1, 4);
  let totalDist = 0;
  let totalTime = 0;
  for (let i = recentCoords.length - pairsCount - 1; i < recentCoords.length - 1; i++) {
    const a = recentCoords[i];
    const b = recentCoords[i + 1];
    const dt = (b.timestamp - a.timestamp) / 1000;
    if (dt > 0) {
      totalDist += distanceMeters(a, b);
      totalTime += dt;
    }
  }

  const speedMs = totalTime > 0 ? Math.min(totalDist / totalTime, MAX_SPEED_MS) : 0;

  return {
    anchorLat: anchor.latitude,
    anchorLon: anchor.longitude,
    speedMs,
    headingRad: heading,
    metersNorth: 0,
    metersEast: 0,
    lastTimestampMs: anchor.timestamp,
  };
}

/**
 * Один шаг предсказания (~100мс).
 * Обновляет курс по гироскопу и экстраполирует позицию по скорости.
 */
export function bridgeStep(
  prev: BridgeState,
  gyroZ: number,
  accelMagnitude: number,
  timestampMs: number
): BridgeState {
  const dt =
    prev.lastTimestampMs != null
      ? Math.max(0.01, Math.min(0.5, (timestampMs - prev.lastTimestampMs) / 1000))
      : 0.1;

  // ZUPT: если устройство почти не движется, обнуляем скорость
  const accelDiff = Math.abs(accelMagnitude - GRAVITY_MS2);
  const isStationary = accelDiff < ZUPT_ACCEL_THRESHOLD && Math.abs(gyroZ) < ZUPT_GYRO_THRESHOLD;
  if (isStationary) {
    return {
      ...prev,
      speedMs: 0,
      lastTimestampMs: timestampMs,
    };
  }

  const headingRad = prev.headingRad + gyroZ * dt;
  const speed = prev.speedMs * Math.pow(SPEED_DECAY, dt * 10);

  const metersNorth = prev.metersNorth + speed * dt * Math.cos(headingRad);
  const metersEast = prev.metersEast + speed * dt * Math.sin(headingRad);

  return {
    ...prev,
    headingRad,
    speedMs: speed,
    metersNorth,
    metersEast,
    lastTimestampMs: timestampMs,
  };
}

/**
 * Конвертировать состояние моста в Coordinate.
 */
export function bridgeStateToCoordinate(state: BridgeState, timestamp: number): Coordinate {
  const { latitude, longitude } = metersToLatLon(
    state.anchorLat,
    state.anchorLon,
    state.metersNorth,
    state.metersEast
  );
  return { latitude, longitude, timestamp, source: 'imu' };
}
