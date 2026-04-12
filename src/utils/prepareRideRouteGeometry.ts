import { Image } from 'react-native';
import type { MarkerConfig } from 'expo-osm-sdk';
import type { Coordinate } from '../types';
import { splitCoordinatesIntoSegments } from './rideSegments';

/**
 * Цветные PNG — expo-osm-sdk на Android красит маркер только при `icon.uri`;
 * на iOS SF Symbols без `.alwaysTemplate` игнорируют `icon.color` (пин остаётся красным).
 */
const ROUTE_PIN_START_URI = Image.resolveAssetSource(require('../../assets/markers/pin-start.png')).uri;
const ROUTE_PIN_END_URI = Image.resolveAssetSource(require('../../assets/markers/pin-end.png')).uri;
const ROUTE_PIN_SINGLE_URI = Image.resolveAssetSource(require('../../assets/markers/pin-single.png')).uri;

export type NormalizedCoord = {
  latitude: number;
  longitude: number;
  timestamp: number;
  originalIndex: number;
};

/** @deprecated use MarkerConfig from expo-osm-sdk */
export type RouteMarker = MarkerConfig;

export type PreparedRouteGeometry = {
  normalizedCoords: NormalizedCoord[];
  polylineCoords: { latitude: number; longitude: number }[];
  routeMarkers: MarkerConfig[];
  routeBounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  } | null;
  routeRegion: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null;
  routeZoom: number;
};

/** Маршруты с большим числом точек обрабатываем асинхронно, чтобы не блокировать первый кадр экрана. */
export const RIDE_ROUTE_HEAVY_POINT_THRESHOLD = 500;

function clampLatitude(latitude: number): number {
  return Math.max(Math.min(latitude, 85.05112878), -85.05112878);
}

function mercatorY(latitude: number): number {
  const latRad = (clampLatitude(latitude) * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + latRad / 2));
}

export function calculateRouteFitZoom(
  bounds: PreparedRouteGeometry['routeBounds'],
  viewport: { width: number; height: number },
  padding = 24
): number {
  if (!bounds) return 14;

  const usableWidth = Math.max(viewport.width - padding * 2, 80);
  const usableHeight = Math.max(viewport.height - padding * 2, 80);

  const lonSpan = Math.max(bounds.maxLon - bounds.minLon, 0.0002);
  const lonZoom = Math.log2((usableWidth * 360) / (lonSpan * 256));

  const mercatorSpan = Math.max(
    Math.abs(mercatorY(bounds.maxLat) - mercatorY(bounds.minLat)),
    0.00001
  );
  const latZoom = Math.log2((usableHeight * 2 * Math.PI) / (mercatorSpan * 256));

  const zoom = Math.min(lonZoom, latZoom);
  return Math.max(2, Math.min(18, zoom));
}

export function prepareRideRouteGeometry(rideCoordinates: Coordinate[]): PreparedRouteGeometry {
  const mapped = rideCoordinates
    .map((c, index) => ({
      latitude: Number(c.latitude),
      longitude: Number(c.longitude),
      timestamp: Number(c.timestamp),
      originalIndex: index,
    }))
    .filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude));

  const normalizedCoords = mapped.sort((a, b) => {
    const aHasTime = Number.isFinite(a.timestamp);
    const bHasTime = Number.isFinite(b.timestamp);
    if (aHasTime && bHasTime) {
      return a.timestamp - b.timestamp;
    }
    return a.originalIndex - b.originalIndex;
  });

  const polylineCoords = normalizedCoords.map((c) => ({
    latitude: c.latitude,
    longitude: c.longitude,
  }));

  let routeMarkers: MarkerConfig[] = [];
  if (normalizedCoords.length > 0) {
    const start = normalizedCoords[0];
    const end = normalizedCoords[normalizedCoords.length - 1];
    if (normalizedCoords.length === 1) {
      routeMarkers = [
        {
          id: 'single_point',
          coordinate: { latitude: start.latitude, longitude: start.longitude },
          title: 'Точка маршрута',
          icon: { uri: ROUTE_PIN_SINGLE_URI, size: 120, anchor: { x: 0.5, y: 0.5 } },
          zIndex: 2,
        },
      ];
    } else {
      routeMarkers = [
        {
          id: 'route_start',
          coordinate: { latitude: start.latitude, longitude: start.longitude },
          title: 'Старт',
          icon: { uri: ROUTE_PIN_START_URI, size: 128, anchor: { x: 0.5, y: 0.5 } },
          zIndex: 1,
        },
        {
          id: 'route_end',
          coordinate: { latitude: end.latitude, longitude: end.longitude },
          title: 'Финиш',
          icon: { uri: ROUTE_PIN_END_URI, size: 128, anchor: { x: 0.5, y: 0.5 } },
          zIndex: 2,
        },
      ];
    }
  }

  let routeBounds: PreparedRouteGeometry['routeBounds'] = null;
  let routeRegion: PreparedRouteGeometry['routeRegion'] = null;
  if (normalizedCoords.length > 0) {
    const lats = normalizedCoords.map((c) => c.latitude);
    const lons = normalizedCoords.map((c) => c.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    routeBounds = { minLat, maxLat, minLon, maxLon };
    const latitudeDelta = Math.max((maxLat - minLat) * 1.4, 0.0025);
    const longitudeDelta = Math.max((maxLon - minLon) * 1.4, 0.0025);
    routeRegion = {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta,
      longitudeDelta,
    };
  }

  let routeZoom = 14;
  if (routeRegion) {
    const maxDelta = Math.max(routeRegion.latitudeDelta, routeRegion.longitudeDelta);
    if (maxDelta > 0.2) routeZoom = 10;
    else if (maxDelta > 0.08) routeZoom = 11;
    else if (maxDelta > 0.04) routeZoom = 12;
    else if (maxDelta > 0.02) routeZoom = 13;
    else if (maxDelta > 0.01) routeZoom = 14;
    else if (maxDelta > 0.005) routeZoom = 15;
    else routeZoom = 16;
  }

  return {
    normalizedCoords,
    polylineCoords,
    routeMarkers,
    routeBounds,
    routeRegion,
    routeZoom,
  };
}

/**
 * Маркеры начала/конца каждого отрезка (после паузы) по полным координатам поездки.
 * Согласовано с {@link splitCoordinatesIntoSegments} и цветными полилиниями на деталях.
 */
export function buildSegmentBoundaryMarkers(
  rideCoordinates: Coordinate[],
  segmentStartIndices: number[] | undefined | null
): MarkerConfig[] {
  const segments = splitCoordinatesIntoSegments(rideCoordinates, segmentStartIndices);
  if (segments.length === 0) {
    return [];
  }

  if (segments.length === 1) {
    const seg = segments[0]!;
    if (seg.length === 0) return [];
    const start = seg[0]!;
    const end = seg[seg.length - 1]!;
    if (seg.length === 1) {
      return [
        {
          id: 'route_single',
          coordinate: { latitude: start.latitude, longitude: start.longitude },
          title: 'Точка маршрута',
          icon: { uri: ROUTE_PIN_SINGLE_URI, size: 120, anchor: { x: 0.5, y: 0.5 } },
          zIndex: 2,
        },
      ];
    }
    return [
      {
        id: 'route_start',
        coordinate: { latitude: start.latitude, longitude: start.longitude },
        title: 'Старт',
        icon: { uri: ROUTE_PIN_START_URI, size: 128, anchor: { x: 0.5, y: 0.5 } },
        zIndex: 1,
      },
      {
        id: 'route_end',
        coordinate: { latitude: end.latitude, longitude: end.longitude },
        title: 'Финиш',
        icon: { uri: ROUTE_PIN_END_URI, size: 128, anchor: { x: 0.5, y: 0.5 } },
        zIndex: 2,
      },
    ];
  }

  const markers: MarkerConfig[] = [];
  segments.forEach((seg, i) => {
    const n = i + 1;
    if (seg.length === 0) return;
    const start = seg[0]!;
    const end = seg[seg.length - 1]!;
    if (seg.length === 1) {
      markers.push({
        id: `route_seg_${n}_point`,
        coordinate: { latitude: start.latitude, longitude: start.longitude },
        title: `Отрезок ${n}`,
        icon: { uri: ROUTE_PIN_SINGLE_URI, size: 120, anchor: { x: 0.5, y: 0.5 } },
        zIndex: 100 + n,
      });
      return;
    }
    markers.push({
      id: `route_seg_${n}_start`,
      coordinate: { latitude: start.latitude, longitude: start.longitude },
      title: `Старт ${n}`,
      icon: { uri: ROUTE_PIN_START_URI, size: 128, anchor: { x: 0.5, y: 0.5 } },
      zIndex: 100 + n * 2,
    });
    markers.push({
      id: `route_seg_${n}_end`,
      coordinate: { latitude: end.latitude, longitude: end.longitude },
      title: `Финиш ${n}`,
      icon: { uri: ROUTE_PIN_END_URI, size: 128, anchor: { x: 0.5, y: 0.5 } },
      zIndex: 101 + n * 2,
    });
  });
  return markers;
}
