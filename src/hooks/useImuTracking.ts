import React from 'react';
import { Accelerometer, Gyroscope } from 'expo-sensors';

export type ImuTrackingStatus = 'off' | 'listening' | 'no_data';

export interface ImuSample {
  x: number;
  y: number;
  z: number;
}

const IMU_UPDATE_INTERVAL_MS = 250;
const NO_DATA_TIMEOUT_MS = 2000;
const WATCHDOG_TICK_MS = 500;

export function useImuTracking() {
  const [status, setStatus] = React.useState<ImuTrackingStatus>('off');
  const [lastSample, setLastSample] = React.useState<ImuSample | null>(null);
  const [lastSampleAt, setLastSampleAt] = React.useState<number | null>(null);
  const [sampleCount, setSampleCount] = React.useState(0);

  const [gyroscopeStatus, setGyroscopeStatus] = React.useState<ImuTrackingStatus>('off');
  const [gyroscopeLastSample, setGyroscopeLastSample] = React.useState<ImuSample | null>(null);
  const [gyroscopeLastSampleAt, setGyroscopeLastSampleAt] = React.useState<number | null>(null);
  const [gyroscopeSampleCount, setGyroscopeSampleCount] = React.useState(0);

  const accelerometerSubscriptionRef = React.useRef<{ remove: () => void } | null>(null);
  const gyroscopeSubscriptionRef = React.useRef<{ remove: () => void } | null>(null);
  const watchdogTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const clearWatchdog = React.useCallback(() => {
    if (watchdogTimerRef.current) {
      clearInterval(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
  }, []);

  const stop = React.useCallback(() => {
    if (accelerometerSubscriptionRef.current) {
      accelerometerSubscriptionRef.current.remove();
      accelerometerSubscriptionRef.current = null;
    }
    if (gyroscopeSubscriptionRef.current) {
      gyroscopeSubscriptionRef.current.remove();
      gyroscopeSubscriptionRef.current = null;
    }
    clearWatchdog();
    setStatus('off');
    setGyroscopeStatus('off');
  }, [clearWatchdog]);

  const start = React.useCallback(async (): Promise<boolean> => {
    if (accelerometerSubscriptionRef.current || gyroscopeSubscriptionRef.current) {
      return true;
    }

    const [accelerometerAvailable, gyroscopeAvailable] = await Promise.all([
      Accelerometer.isAvailableAsync(),
      Gyroscope.isAvailableAsync(),
    ]);

    if (!accelerometerAvailable && !gyroscopeAvailable) {
      setStatus('no_data');
      setGyroscopeStatus('no_data');
      return false;
    }

    setSampleCount(0);
    setLastSample(null);
    setLastSampleAt(null);
    setStatus(accelerometerAvailable ? 'listening' : 'no_data');

    setGyroscopeSampleCount(0);
    setGyroscopeLastSample(null);
    setGyroscopeLastSampleAt(null);
    setGyroscopeStatus(gyroscopeAvailable ? 'listening' : 'no_data');

    if (accelerometerAvailable) {
      Accelerometer.setUpdateInterval(IMU_UPDATE_INTERVAL_MS);
      accelerometerSubscriptionRef.current = Accelerometer.addListener((data) => {
        setLastSample({
          x: data.x,
          y: data.y,
          z: data.z,
        });
        setLastSampleAt(Date.now());
        setSampleCount((prev) => prev + 1);
        setStatus('listening');
      });
    }

    if (gyroscopeAvailable) {
      Gyroscope.setUpdateInterval(IMU_UPDATE_INTERVAL_MS);
      gyroscopeSubscriptionRef.current = Gyroscope.addListener((data) => {
        setGyroscopeLastSample({
          x: data.x,
          y: data.y,
          z: data.z,
        });
        setGyroscopeLastSampleAt(Date.now());
        setGyroscopeSampleCount((prev) => prev + 1);
        setGyroscopeStatus('listening');
      });
    }

    clearWatchdog();
    watchdogTimerRef.current = setInterval(() => {
      const now = Date.now();

      if (accelerometerAvailable) {
        setLastSampleAt((prev) => {
          if (prev != null && now - prev > NO_DATA_TIMEOUT_MS) {
            setStatus('no_data');
          }
          return prev;
        });
      }

      if (gyroscopeAvailable) {
        setGyroscopeLastSampleAt((prev) => {
          if (prev != null && now - prev > NO_DATA_TIMEOUT_MS) {
            setGyroscopeStatus('no_data');
          }
          return prev;
        });
      }
    }, WATCHDOG_TICK_MS);

    return true;
  }, [clearWatchdog]);

  React.useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    status,
    lastSample,
    lastSampleAt,
    sampleCount,
    gyroscopeStatus,
    gyroscopeLastSample,
    gyroscopeLastSampleAt,
    gyroscopeSampleCount,
    start,
    stop,
    isRunning: status !== 'off' || gyroscopeStatus !== 'off',
  };
}
