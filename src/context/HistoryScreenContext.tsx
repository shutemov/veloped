import React from 'react';
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
  deleteRide: (id: string) => Promise<void>;
  importRides: (rides: Ride[]) => Promise<void>;
  registerSwitchToImportedTab: (fn: (() => void) | null) => void;
  switchToImportedTab: () => void;
};

const HistoryScreenContext = React.createContext<HistoryScreenContextValue | null>(null);

type ProviderProps = {
  children: React.ReactNode;
  rides: Ride[];
  loading: boolean;
  refresh: () => void;
  navigateToRideDetail: (ride: Ride) => void;
  deleteRide: (id: string) => Promise<void>;
  importRides: (rides: Ride[]) => Promise<void>;
};

export function HistoryScreenProvider({
  children,
  rides,
  loading,
  refresh,
  navigateToRideDetail,
  deleteRide,
  importRides,
}: ProviderProps) {
  const [activeTab, setActiveTabState] = React.useState<HistoryActiveTab>('my');
  const switchToImportedRef = React.useRef<(() => void) | null>(null);

  const setActiveTab = React.useCallback((tab: HistoryActiveTab) => {
    setActiveTabState(tab);
  }, []);

  const registerSwitchToImportedTab = React.useCallback((fn: (() => void) | null) => {
    switchToImportedRef.current = fn;
  }, []);

  const switchToImportedTab = React.useCallback(() => {
    switchToImportedRef.current?.();
  }, []);

  /** Записанные поездки: по умолчанию от новых к старым (для списка и экспорта GPX). */
  const recordedRides = rides
    .filter(isRecordedRide)
    .sort((a, b) => b.startTime - a.startTime || a.id.localeCompare(b.id));
  const importedRides = rides.filter(isImportedRide).sort((a, b) => b.startTime - a.startTime);

  const value: HistoryScreenContextValue = {
    rides,
    recordedRides,
    importedRides,
    loading,
    refresh,
    activeTab,
    setActiveTab,
    navigateToRideDetail,
    deleteRide,
    importRides,
    registerSwitchToImportedTab,
    switchToImportedTab,
  };

  return (
    <HistoryScreenContext.Provider value={value}>{children}</HistoryScreenContext.Provider>
  );
}

export function useHistoryScreenContext(): HistoryScreenContextValue {
  const ctx = React.useContext(HistoryScreenContext);
  if (!ctx) {
    throw new Error('useHistoryScreenContext must be used within HistoryScreenProvider');
  }
  return ctx;
}
