import type { Ride } from '../types';

export function isRecordedRide(ride: Ride): boolean {
  return ride.source !== 'imported';
}

export function isImportedRide(ride: Ride): boolean {
  return ride.source === 'imported';
}

export function importKindLabel(kind: Ride['importKind']): string {
  if (kind === 'bundle_all') return 'Пакет: все маршруты';
  if (kind === 'single_track') return 'Один маршрут';
  return 'Импорт';
}
