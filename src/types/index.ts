export interface Coordinate {
  latitude: number;
  longitude: number;
  timestamp: number;
}

export interface Ride {
  id: string;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  distanceKm: number;
  coordinates: Coordinate[];
}

export type TrackingState = 'idle' | 'tracking' | 'finished';
