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
 */
export function useGpsAccuracy(options?: UseGpsAccuracyOptions) {
  const config = React.useMemo(
    () => ({
      ...DEFAULT_GPS_ACCURACY_HYSTERESIS,
      ...options,
    }),
    [options?.reliableMaxM, options?.uncertainMinM]
  );

  const [gpsAccuracyMeters, setGpsAccuracyMeters] = React.useState<number | null>(null);
  const [gpsQualityZone, setGpsQualityZone] = React.useState<GpsQualityZone>('unknown');

  const applyLocation = React.useCallback(
    (location: Location.LocationObject) => {
      const acc = location.coords.accuracy;
      setGpsAccuracyMeters(acc);
      setGpsQualityZone((prev) => reduceGpsQualityZone(prev, acc, config));
    },
    [config]
  );

  const seedFromStoredAccuracy = React.useCallback(
    (accuracyMeters: number | null | undefined) => {
      if (accuracyMeters === undefined) {
        return;
      }
      setGpsAccuracyMeters(accuracyMeters);
      setGpsQualityZone(reduceGpsQualityZone('unknown', accuracyMeters, config));
    },
    [config]
  );

  const reset = React.useCallback(() => {
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
