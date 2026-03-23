import type { Ride } from '../types';

export type RideListSortMode = 'date' | 'distance';

/** Списки из контекста уже отсортированы по дате (новые первые). */
export function sortRidesForList(rides: Ride[], mode: RideListSortMode): Ride[] {
  if (mode === 'date') {
    return rides;
  }
  return [...rides].sort(
    (a, b) =>
      b.distanceKm - a.distanceKm || b.startTime - a.startTime || a.id.localeCompare(b.id)
  );
}
