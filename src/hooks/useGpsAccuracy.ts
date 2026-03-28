import React from 'react';
import * as Location from 'expo-location';
import {
  DEFAULT_GPS_ACCURACY_HYSTERESIS,
  reduceGpsQualityZone,
  type GpsAccuracyHysteresisConfig,
  type GpsQualityZone,
} from '../utils/gpsAccuracy';

export type { GpsQualityZone, GpsAccuracyHysteresisConfig };

type UseGpsAccuracyOptions = Partial<GpsAccuracyHysteresisConfig>;

/**
 * Состояние точности GPS и зоны качества (для гибрида с IMU и отдельных экранов).
 * В `useTracking` тот же колбэк `applyLocation` вызывается из существующего watch, без второй подписки.
 *
 * Debounce: переход uncertain → reliable происходит только после
 * `reliableDebounceCount` consecutive reliable фиксов подряд.
 */
export function useGpsAccuracy(options?: UseGpsAccuracyOptions) {
  const config = React.useMemo(
    () => ({
      ...DEFAULT_GPS_ACCURACY_HYSTERESIS,
      ...options,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options?.reliableMaxM, options?.uncertainMinM, options?.reliableDebounceCount, options?.speedSanityCheckM]
  );

  const [gpsAccuracyMeters, setGpsAccuracyMeters] = React.useState<number | null>(null);
  const [gpsQualityZone, setGpsQualityZone] = React.useState<GpsQualityZone>('unknown');

  /** Счётчик consecutive reliable фиксов (для debounce восстановления из uncertain). */
  const consecutiveReliableRef = React.useRef(0);

  const applyLocation = React.useCallback(
    (location: Location.LocationObject) => {
      const acc = location.coords.accuracy;
      const speedMs = location.coords.speed ?? null;
      setGpsAccuracyMeters(acc);

      setGpsQualityZone((prev) => {
        const raw = reduceGpsQualityZone(prev, acc, config, speedMs);

        if (raw === 'reliable') {
          consecutiveReliableRef.current += 1;
          const debounceCount = config.reliableDebounceCount ?? 2;
          // Переходим в reliable только набрав нужное количество подряд
          if (prev !== 'reliable' && consecutiveReliableRef.current < debounceCount) {
            return prev === 'unknown' ? 'uncertain' : prev;
          }
          return 'reliable';
        }

        // Сброс счётчика при любом не-reliable фиксе
        consecutiveReliableRef.current = 0;
        return raw;
      });
    },
    [config]
  );

  const seedFromStoredAccuracy = React.useCallback(
    (accuracyMeters: number | null | undefined) => {
      if (accuracyMeters === undefined) {
        return;
      }
      consecutiveReliableRef.current = 0;
      setGpsAccuracyMeters(accuracyMeters);
      setGpsQualityZone(reduceGpsQualityZone('unknown', accuracyMeters, config));
    },
    [config]
  );

  const reset = React.useCallback(() => {
    consecutiveReliableRef.current = 0;
    setGpsAccuracyMeters(null);
    setGpsQualityZone('unknown');
  }, []);

  return {
    gpsAccuracyMeters,
    gpsQualityZone,
    applyLocation,
    seedFromStoredAccuracy,
    reset,
  };
}
