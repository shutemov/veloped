export interface Coordinate {
  latitude: number;
  longitude: number;
  timestamp: number;
}

export type RideSource = 'recorded' | 'imported' | 'imu_dev';

/** Как пришёл импорт: одна поездка или пакетный экспорт «все маршруты». */
export type ImportKind = 'single_track' | 'bundle_all';

export interface Ride {
  id: string;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  distanceKm: number;
  coordinates: Coordinate[];
  /** По умолчанию считается записанной на устройстве (legacy без поля). */
  source?: RideSource;
  importedAt?: number;
  sourceAppName?: string;
  sourceDeviceLabel?: string;
  importKind?: ImportKind;
  /** Несколько маршрутов из одного пакетного файла. */
  importBatchId?: string;
}

export type TrackingState = 'idle' | 'tracking' | 'finished';
