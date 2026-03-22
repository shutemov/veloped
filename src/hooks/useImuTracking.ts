import React from 'react';
import { Accelerometer, Gyroscope, Magnetometer } from 'expo-sensors';

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
  const [magnetometerStatus, setMagnetometerStatus] = React.useState<ImuTrackingStatus>('off');
  const [magnetometerLastSample, setMagnetometerLastSample] = React.useState<ImuSample | null>(null);
  const [magnetometerLastSampleAt, setMagnetometerLastSampleAt] = React.useState<number | null>(null);
  const [magnetometerSampleCount, setMagnetometerSampleCount] = React.useState(0);

  const accelerometerSubscriptionRef = React.useRef<{ remove: () => void } | null>(null);
  const gyroscopeSubscriptionRef = React.useRef<{ remove: () => void } | null>(null);
  const magnetometerSubscriptionRef = React.useRef<{ remove: () => void } | null>(null);
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
    if (magnetometerSubscriptionRef.current) {
      magnetometerSubscriptionRef.current.remove();
      magnetometerSubscriptionRef.current = null;
    }
    clearWatchdog();
    setStatus('off');
    setGyroscopeStatus('off');
    setMagnetometerStatus('off');
  }, [clearWatchdog]);

  const start = React.useCallback(async (): Promise<boolean> => {
    if (
      accelerometerSubscriptionRef.current ||
      gyroscopeSubscriptionRef.current ||
      magnetometerSubscriptionRef.current
    ) {
      return true;
    }

    const [accelerometerAvailable, gyroscopeAvailable, magnetometerAvailable] = await Promise.all([
      Accelerometer.isAvailableAsync(),
      Gyroscope.isAvailableAsync(),
      Magnetometer.isAvailableAsync(),
    ]);

    if (!accelerometerAvailable && !gyroscopeAvailable && !magnetometerAvailable) {
      setStatus('no_data');
      setGyroscopeStatus('no_data');
      setMagnetometerStatus('no_data');
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
    setMagnetometerSampleCount(0);
    setMagnetometerLastSample(null);
    setMagnetometerLastSampleAt(null);
    setMagnetometerStatus(magnetometerAvailable ? 'listening' : 'no_data');

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
    if (magnetometerAvailable) {
      Magnetometer.setUpdateInterval(IMU_UPDATE_INTERVAL_MS);
      magnetometerSubscriptionRef.current = Magnetometer.addListener((data) => {
        setMagnetometerLastSample({
          x: data.x,
          y: data.y,
          z: data.z,
        });
        setMagnetometerLastSampleAt(Date.now());
        setMagnetometerSampleCount((prev) => prev + 1);
        setMagnetometerStatus('listening');
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
      if (magnetometerAvailable) {
        setMagnetometerLastSampleAt((prev) => {
          if (prev != null && now - prev > NO_DATA_TIMEOUT_MS) {
            setMagnetometerStatus('no_data');
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
    magnetometerStatus,
    magnetometerLastSample,
    magnetometerLastSampleAt,
    magnetometerSampleCount,
    start,
    stop,
    isRunning:
      status !== 'off' ||
      gyroscopeStatus !== 'off' ||
      magnetometerStatus !== 'off',
  };
}
