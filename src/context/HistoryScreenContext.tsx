import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Ride } from '../types';
import { isImportedRide, isRecordedRide } from '../utils/rideSource';

export type HistoryActiveTab = 'my' | 'imported';

type HistoryScreenContextValue = {
  rides: Ride[];
  recordedRides: Ride[];
  importedRides: Ride[];
  loading: boolean;
  refresh: () => void;
  activeTab: HistoryActiveTab;
  setActiveTab: (tab: HistoryActiveTab) => void;
  navigateToRideDetail: (ride: Ride) => void;
  importRides: (rides: Ride[]) => Promise<void>;
  registerSwitchToImportedTab: (fn: (() => void) | null) => void;
  switchToImportedTab: () => void;
};

const HistoryScreenContext = createContext<HistoryScreenContextValue | null>(null);

type ProviderProps = {
  children: React.ReactNode;
  rides: Ride[];
  loading: boolean;
  refresh: () => void;
  navigateToRideDetail: (ride: Ride) => void;
  importRides: (rides: Ride[]) => Promise<void>;
};

export function HistoryScreenProvider({
  children,
  rides,
  loading,
  refresh,
  navigateToRideDetail,
  importRides,
}: ProviderProps) {
  const [activeTab, setActiveTabState] = useState<HistoryActiveTab>('my');
  const switchToImportedRef = useRef<(() => void) | null>(null);

  const setActiveTab = useCallback((tab: HistoryActiveTab) => {
    setActiveTabState(tab);
  }, []);

  const registerSwitchToImportedTab = useCallback((fn: (() => void) | null) => {
    switchToImportedRef.current = fn;
  }, []);

  const switchToImportedTab = useCallback(() => {
    switchToImportedRef.current?.();
  }, []);

  const recordedRides = useMemo(
    () => rides.filter(isRecordedRide).sort((a, b) => b.startTime - a.startTime),
    [rides]
  );
  const importedRides = useMemo(
    () => rides.filter(isImportedRide).sort((a, b) => b.startTime - a.startTime),
    [rides]
  );

  const value = useMemo(
    () => ({
      rides,
      recordedRides,
      importedRides,
      loading,
      refresh,
      activeTab,
      setActiveTab,
      navigateToRideDetail,
      importRides,
      registerSwitchToImportedTab,
      switchToImportedTab,
    }),
    [
      rides,
      recordedRides,
      importedRides,
      loading,
      refresh,
      activeTab,
      setActiveTab,
      navigateToRideDetail,
      importRides,
      registerSwitchToImportedTab,
      switchToImportedTab,
    ]
  );

  return (
    <HistoryScreenContext.Provider value={value}>{children}</HistoryScreenContext.Provider>
  );
}

export function useHistoryScreenContext(): HistoryScreenContextValue {
  const ctx = useContext(HistoryScreenContext);
  if (!ctx) {
    throw new Error('useHistoryScreenContext must be used within HistoryScreenProvider');
  }
  return ctx;
}
