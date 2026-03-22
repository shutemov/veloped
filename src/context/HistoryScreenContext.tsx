import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
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
};

const HistoryScreenContext = createContext<HistoryScreenContextValue | null>(null);

type ProviderProps = {
  children: React.ReactNode;
  rides: Ride[];
  loading: boolean;
  refresh: () => void;
  navigateToRideDetail: (ride: Ride) => void;
};

export function HistoryScreenProvider({
  children,
  rides,
  loading,
  refresh,
  navigateToRideDetail,
}: ProviderProps) {
  const [activeTab, setActiveTabState] = useState<HistoryActiveTab>('my');

  const setActiveTab = useCallback((tab: HistoryActiveTab) => {
    setActiveTabState(tab);
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
