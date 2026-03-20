import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Coordinate } from '../types';

export const LOCATION_TASK_NAME = 'veloped-background-location';
export const ACTIVE_RIDE_KEY = '@veloped/activeRide';

interface ActiveRideData {
  coordinates: Coordinate[];
  startTime: number;
}

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Location task error:', error);
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };

    if (locations && locations.length > 0) {
      try {
        const storedData = await AsyncStorage.getItem(ACTIVE_RIDE_KEY);
        let activeRide: ActiveRideData = storedData
          ? JSON.parse(storedData)
          : { coordinates: [], startTime: Date.now() };

        const newCoordinates: Coordinate[] = locations.map((loc) => ({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          timestamp: loc.timestamp,
        }));

        activeRide.coordinates = [...activeRide.coordinates, ...newCoordinates];

        await AsyncStorage.setItem(ACTIVE_RIDE_KEY, JSON.stringify(activeRide));
      } catch (e) {
        console.error('Failed to save location in background:', e);
      }
    }
  }
});
