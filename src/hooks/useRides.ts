import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
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

export type RidesContextValue = {
  rides: Ride[];
  loading: boolean;
  saveRide: (ride: Ride) => Promise<void>;
  importRides: (newRides: Ride[]) => Promise<void>;
  deleteRide: (id: string) => Promise<void>;
  getRide: (id: string) => Ride | undefined;
  refresh: () => Promise<void>;
};

const RidesContext = createContext<RidesContextValue | null>(null);

function useRidesState(): RidesContextValue {
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRides = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void loadRides();
  }, [loadRides]);

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

  const importRides = useCallback(async (newRides: Ride[]): Promise<void> => {
    if (newRides.length === 0) return;
    try {
      const merged = [...newRides, ...rides].sort((a, b) => b.startTime - a.startTime);
      await AsyncStorage.setItem(RIDES_STORAGE_KEY, JSON.stringify(merged));
      setRides(merged);
    } catch (error) {
      console.error('Failed to import rides:', error);
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
    importRides,
    deleteRide,
    getRide,
    refresh: loadRides,
  };
}

export function RidesProvider({ children }: { children: ReactNode }) {
  const value = useRidesState();
  return React.createElement(RidesContext.Provider, { value }, children);
}

export function useRides(): RidesContextValue {
  const ctx = useContext(RidesContext);
  if (ctx == null) {
    throw new Error('useRides must be used within RidesProvider');
  }
  return ctx;
}
