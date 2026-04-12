export interface Coordinate {
  latitude: number;
  longitude: number;
  timestamp: number;
  /** Источник точки при записи с устройства. */
  source?: 'gps';
}

export type RideSource = 'recorded' | 'imported';

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

export interface ActiveRideData {
  coordinates: Coordinate[];
  startTime: number;
  /** Последняя известная горизонтальная точность (м). */
  lastGpsAccuracyMeters?: number | null;
  /** Признак ручной паузы активной поездки. */
  isPaused?: boolean;
  /** Накопленное время паузы в миллисекундах. */
  totalPausedMs?: number;
  /** Время начала текущей незакрытой паузы. */
  pauseStartedAt?: number | null;
}

export type TrackingState = 'idle' | 'tracking' | 'paused' | 'finished';
