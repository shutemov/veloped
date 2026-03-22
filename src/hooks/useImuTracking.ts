import React from 'react';
import { Accelerometer } from 'expo-sensors';

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

  const subscriptionRef = React.useRef<{ remove: () => void } | null>(null);
  const watchdogTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const clearWatchdog = React.useCallback(() => {
    if (watchdogTimerRef.current) {
      clearInterval(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
  }, []);

  const stop = React.useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
    clearWatchdog();
    setStatus('off');
  }, [clearWatchdog]);

  const start = React.useCallback(async (): Promise<boolean> => {
    if (subscriptionRef.current) {
      return true;
    }

    const isAvailable = await Accelerometer.isAvailableAsync();
    if (!isAvailable) {
      setStatus('no_data');
      return false;
    }

    setSampleCount(0);
    setLastSample(null);
    setLastSampleAt(null);
    setStatus('listening');

    Accelerometer.setUpdateInterval(IMU_UPDATE_INTERVAL_MS);

    subscriptionRef.current = Accelerometer.addListener((data) => {
      setLastSample({
        x: data.x,
        y: data.y,
        z: data.z,
      });
      setLastSampleAt(Date.now());
      setSampleCount((prev) => prev + 1);
      setStatus('listening');
    });

    clearWatchdog();
    watchdogTimerRef.current = setInterval(() => {
      const now = Date.now();
      setLastSampleAt((prev) => {
        if (prev != null && now - prev > NO_DATA_TIMEOUT_MS) {
          setStatus('no_data');
        }
        return prev;
      });
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
    start,
    stop,
    isRunning: status !== 'off',
  };
}
