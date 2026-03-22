import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ride } from '../types';

const RIDES_STORAGE_KEY = '@veloped/rides';

function normalizeStoredRide(raw: Ride): Ride {
  const source = raw.source === 'imported' ? 'imported' : 'recorded';
  return {
    ...raw,
    source,
  };
}

export function useRides() {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRides();
  }, []);

  const loadRides = async () => {
    try {
      const stored = await AsyncStorage.getItem(RIDES_STORAGE_KEY);
      if (stored) {
        const parsed: Ride[] = JSON.parse(stored);
        const normalized = parsed.map(normalizeStoredRide);
        setRides(normalized.sort((a, b) => b.startTime - a.startTime));
      }
    } catch (error) {
      console.error('Failed to load rides:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveRide = useCallback(async (ride: Ride): Promise<void> => {
    try {
      const newRides = [ride, ...rides];
      await AsyncStorage.setItem(RIDES_STORAGE_KEY, JSON.stringify(newRides));
      setRides(newRides);
    } catch (error) {
      console.error('Failed to save ride:', error);
      throw error;
    }
  }, [rides]);

  const deleteRide = useCallback(async (id: string): Promise<void> => {
    try {
      const newRides = rides.filter((ride) => ride.id !== id);
      await AsyncStorage.setItem(RIDES_STORAGE_KEY, JSON.stringify(newRides));
      setRides(newRides);
    } catch (error) {
      console.error('Failed to delete ride:', error);
      throw error;
    }
  }, [rides]);

  const getRide = useCallback(
    (id: string): Ride | undefined => {
      return rides.find((ride) => ride.id === id);
    },
    [rides]
  );

  return {
    rides,
    loading,
    saveRide,
    deleteRide,
    getRide,
    refresh: loadRides,
  };
}
