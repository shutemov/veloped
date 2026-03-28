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
  /**
   * Минимальное число consecutive reliable фиксов, прежде чем перейти из uncertain → reliable.
   * Предотвращает дребезг при нестабильном сигнале. По умолчанию 2.
   */
  reliableDebounceCount?: number;
  /**
   * Если accuracy > speedSanityCheckM и GPS сообщает скорость > 0, принудительно uncertain.
   * null — отключить проверку.
   */
  speedSanityCheckM?: number | null;
};

export const DEFAULT_GPS_ACCURACY_HYSTERESIS: GpsAccuracyHysteresisConfig = {
  reliableMaxM: 20,
  uncertainMinM: 45,
  reliableDebounceCount: 2,
  speedSanityCheckM: 100,
};

/**
 * @param prev предыдущая зона (для полосы между порогами сохраняем, кроме старта с unknown).
 * @param accuracyMeters `location.coords.accuracy` или null, если ОС не отдала.
 * @param speedMs GPS-скорость (м/с), если доступна -- для sanity check. Передайте null если нет.
 */
export function reduceGpsQualityZone(
  prev: GpsQualityZone,
  accuracyMeters: number | null,
  config: GpsAccuracyHysteresisConfig,
  speedMs?: number | null
): GpsQualityZone {
  const { reliableMaxM, uncertainMinM, speedSanityCheckM } = config;
  if (uncertainMinM <= reliableMaxM) {
    throw new Error('gpsAccuracy: uncertainMinM must be greater than reliableMaxM');
  }

  if (accuracyMeters == null) {
    return prev;
  }

  // Speed sanity check: слишком плохая точность при движении -- однозначно uncertain
  if (
    speedSanityCheckM != null &&
    accuracyMeters > speedSanityCheckM &&
    speedMs != null &&
    speedMs > 0.5
  ) {
    return 'uncertain';
  }

  if (accuracyMeters <= reliableMaxM) {
    // Переход в reliable происходит немедленно по accuracy --
    // debounce реализован в useGpsAccuracy через счётчик consecutiveReliableCount
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
