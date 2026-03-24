/**
 * Горизонтальная точность из expo-location (`coords.accuracy`) — радиус неопределённости в метрах.
 * Зона «надёжно / неуверенно» с гистерезисом, чтобы не дребезжать на границе порогов.
 */

export type GpsQualityZone = 'reliable' | 'uncertain' | 'unknown';

export type GpsAccuracyHysteresisConfig = {
  /** Значение accuracy (м) не выше этого — зона reliable. */
  reliableMaxM: number;
  /** Значение accuracy (м) не ниже этого — зона uncertain. */
  uncertainMinM: number;
};

export const DEFAULT_GPS_ACCURACY_HYSTERESIS: GpsAccuracyHysteresisConfig = {
  reliableMaxM: 20,
  uncertainMinM: 45,
};

/**
 * @param prev предыдущая зона (для полосы между порогами сохраняем, кроме старта с unknown).
 * @param accuracyMeters `location.coords.accuracy` или null, если ОС не отдала.
 */
export function reduceGpsQualityZone(
  prev: GpsQualityZone,
  accuracyMeters: number | null,
  config: GpsAccuracyHysteresisConfig
): GpsQualityZone {
  const { reliableMaxM, uncertainMinM } = config;
  if (uncertainMinM <= reliableMaxM) {
    throw new Error('gpsAccuracy: uncertainMinM must be greater than reliableMaxM');
  }

  if (accuracyMeters == null) {
    return prev;
  }

  if (accuracyMeters <= reliableMaxM) {
    return 'reliable';
  }
  if (accuracyMeters >= uncertainMinM) {
    return 'uncertain';
  }

  if (prev === 'unknown') {
    return 'uncertain';
  }
  return prev;
}
