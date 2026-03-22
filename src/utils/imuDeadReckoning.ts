import { Coordinate } from '../types';

/** М/с² — Expo Accelerometer отдаёт ускорение в g. */
const GRAVITY_MS2 = 9.80665;

/** Сглаживание оценки вектора гравитации (EMA). */
const GRAVITY_EMA_ALPHA = 0.92;

/** Затухание скорости (снижает разнос интегратора). */
const VELOCITY_DAMP = 0.96;

/** Порог «почти покой» для ZUPT (м/с²). */
const ZUPT_ACC_MS2 = 0.45;

/** Порог «почти покой» для гироскопа (рад/с). */
const ZUPT_GYRO_RADS = 0.1;

const MAX_SPEED_MS = 22;

export interface ImuDrState {
  anchorLat: number;
  anchorLon: number;
  metersNorth: number;
  metersEast: number;
  velNorth: number;
  velEast: number;
  /** Радианы: поворот вокруг оси Z устройства (экран к пользователю). */
  heading: number;
  /** Оценка гравитации в м/с² (телесная СК). */
  gravity: { x: number; y: number; z: number };
  lastTimestampMs: number | null;
}

export function createImuDrState(anchor: Coordinate): ImuDrState {
  return {
    anchorLat: anchor.latitude,
    anchorLon: anchor.longitude,
    metersNorth: 0,
    metersEast: 0,
    velNorth: 0,
    velEast: 0,
    heading: 0,
    gravity: { x: 0, y: 0, z: GRAVITY_MS2 },
    lastTimestampMs: null,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function metersToLatLon(
  anchorLat: number,
  anchorLon: number,
  metersNorth: number,
  metersEast: number
): { latitude: number; longitude: number } {
  const metersPerLat = 111_320;
  const metersPerLon = 111_320 * Math.cos((anchorLat * Math.PI) / 180);
  return {
    latitude: anchorLat + metersNorth / metersPerLat,
    longitude: anchorLon + metersEast / metersPerLon,
  };
}

/**
 * Один шаг грубого dead reckoning по acc (g) + gyro (рад/с).
 * Предполагается портретная ориентация: ось Z ≈ гравитация, горизонтальное ускорение в X/Y.
 */
export function imuDeadReckoningStep(
  prev: ImuDrState,
  accG: { x: number; y: number; z: number },
  gyroRads: { x: number; y: number; z: number },
  timestampMs: number
): ImuDrState {
  let dt = 0.1;
  if (prev.lastTimestampMs != null) {
    dt = Math.max(0.01, Math.min(0.25, (timestampMs - prev.lastTimestampMs) / 1000));
  }

  const acc = {
    x: accG.x * GRAVITY_MS2,
    y: accG.y * GRAVITY_MS2,
    z: accG.z * GRAVITY_MS2,
  };

  const g = {
    x: GRAVITY_EMA_ALPHA * prev.gravity.x + (1 - GRAVITY_EMA_ALPHA) * acc.x,
    y: GRAVITY_EMA_ALPHA * prev.gravity.y + (1 - GRAVITY_EMA_ALPHA) * acc.y,
    z: GRAVITY_EMA_ALPHA * prev.gravity.z + (1 - GRAVITY_EMA_ALPHA) * acc.z,
  };

  const lin = { x: acc.x - g.x, y: acc.y - g.y, z: acc.z - g.z };
  const gNorm = Math.hypot(g.x, g.y, g.z) || 1;
  const gx = g.x / gNorm;
  const gy = g.y / gNorm;
  const gz = g.z / gNorm;
  const dot = lin.x * gx + lin.y * gy + lin.z * gz;
  const hlx = lin.x - dot * gx;
  const hly = lin.y - dot * gy;

  let heading = prev.heading + gyroRads.z * dt;

  const aNorth = hly * Math.cos(heading) - hlx * Math.sin(heading);
  const aEast = hlx * Math.cos(heading) + hly * Math.sin(heading);

  let velNorth = prev.velNorth + aNorth * dt;
  let velEast = prev.velEast + aEast * dt;

  velNorth *= VELOCITY_DAMP;
  velEast *= VELOCITY_DAMP;

  const linMag = Math.hypot(lin.x, lin.y, lin.z);
  const gyroMag = Math.hypot(gyroRads.x, gyroRads.y, gyroRads.z);
  if (linMag < ZUPT_ACC_MS2 && gyroMag < ZUPT_GYRO_RADS) {
    velNorth = 0;
    velEast = 0;
  }

  const speed = Math.hypot(velNorth, velEast);
  if (speed > MAX_SPEED_MS) {
    const s = MAX_SPEED_MS / speed;
    velNorth *= s;
    velEast *= s;
  }

  let metersNorth = prev.metersNorth + velNorth * dt;
  let metersEast = prev.metersEast + velEast * dt;

  const maxOffsetM = 50_000;
  metersNorth = clamp(metersNorth, -maxOffsetM, maxOffsetM);
  metersEast = clamp(metersEast, -maxOffsetM, maxOffsetM);

  return {
    ...prev,
    gravity: g,
    heading,
    velNorth,
    velEast,
    metersNorth,
    metersEast,
    lastTimestampMs: timestampMs,
  };
}

export function imuStateToCoordinate(state: ImuDrState, timestamp: number): Coordinate {
  const { latitude, longitude } = metersToLatLon(
    state.anchorLat,
    state.anchorLon,
    state.metersNorth,
    state.metersEast
  );
  return { latitude, longitude, timestamp };
}
