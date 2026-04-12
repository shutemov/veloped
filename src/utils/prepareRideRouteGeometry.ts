import type { MarkerConfig } from 'expo-osm-sdk';
import type { Coordinate } from '../types';
import type { LogicalMapMarker, SegmentRasterSpec } from '../types/segmentMarkers';
import { splitCoordinatesIntoSegments } from './rideSegments';

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
  /** Маркеры для растеризации через {@link useRasterizedMapMarkers} (не для прямой передачи в карту). */
  logicalMarkers: LogicalMapMarker[];
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

/** ~1 м по широте — достаточно, чтобы сличать дубликаты GPS на границе паузы. */
function coordsAlmostEqual(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
  eps = 1e-5
): boolean {
  return Math.abs(a.latitude - b.latitude) < eps && Math.abs(a.longitude - b.longitude) < eps;
}

function mergeCoincidentLogicalSegmentMarkers(markers: LogicalMapMarker[]): LogicalMapMarker[] {
  const out: LogicalMapMarker[] = [];
  for (let i = 0; i < markers.length; i++) {
    const cur = markers[i]!;
    const next = markers[i + 1];
    const endMatch = /^route_seg_(\d+)_end$/.exec(cur.id);
    const startMatch = next && /^route_seg_(\d+)_start$/.exec(next.id);
    if (
      endMatch &&
      startMatch &&
      Number(endMatch[1]) + 1 === Number(startMatch[1]) &&
      coordsAlmostEqual(cur.coordinate, next.coordinate)
    ) {
      const n = Number(endMatch[1]);
      const m = Number(startMatch[1]);
      const spec: SegmentRasterSpec = { kind: 'boundary', finishN: n, startN: m };
      out.push({
        id: `route_seg_boundary_${n}_${m}`,
        coordinate: cur.coordinate,
        title: `Финиш #${n} · Старт #${m}`,
        rasterSpec: spec,
        zIndex: Math.max(cur.zIndex ?? 0, next.zIndex ?? 0),
      });
      i += 1;
      continue;
    }
    out.push(cur);
  }
  return out;
}

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

  let logicalMarkers: LogicalMapMarker[] = [];
  if (normalizedCoords.length > 0) {
    const start = normalizedCoords[0];
    const end = normalizedCoords[normalizedCoords.length - 1];
    if (normalizedCoords.length === 1) {
      logicalMarkers = [
        {
          id: 'single_point',
          coordinate: { latitude: start.latitude, longitude: start.longitude },
          title: 'Точка маршрута',
          rasterSpec: { kind: 'routePoint' },
          zIndex: 2,
        },
      ];
    } else {
      logicalMarkers = [
        {
          id: 'route_start',
          coordinate: { latitude: start.latitude, longitude: start.longitude },
          title: 'Старт #1',
          rasterSpec: { kind: 'start', n: 1 },
          zIndex: 1,
        },
        {
          id: 'route_end',
          coordinate: { latitude: end.latitude, longitude: end.longitude },
          title: 'Финиш #1',
          rasterSpec: { kind: 'end', n: 1 },
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
    logicalMarkers,
    routeBounds,
    routeRegion,
    routeZoom,
  };
}

/**
 * Маркеры начала/конца каждого отрезка (после паузы) по полным координатам поездки.
 * Растеризация: {@link useRasterizedMapMarkers}.
 */
export function buildLogicalSegmentBoundaryMarkers(
  rideCoordinates: Coordinate[],
  segmentStartIndices: number[] | undefined | null
): LogicalMapMarker[] {
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
          rasterSpec: { kind: 'routePoint' },
          zIndex: 2,
        },
      ];
    }
    return [
      {
        id: 'route_start',
        coordinate: { latitude: start.latitude, longitude: start.longitude },
        title: 'Старт #1',
        rasterSpec: { kind: 'start', n: 1 },
        zIndex: 1,
      },
      {
        id: 'route_end',
        coordinate: { latitude: end.latitude, longitude: end.longitude },
        title: 'Финиш #1',
        rasterSpec: { kind: 'end', n: 1 },
        zIndex: 2,
      },
    ];
  }

  const markers: LogicalMapMarker[] = [];
  segments.forEach((seg, i) => {
    const n = i + 1;
    if (seg.length === 0) return;
    const start = seg[0]!;
    const end = seg[seg.length - 1]!;
    if (seg.length === 1) {
      markers.push({
        id: `route_seg_${n}_point`,
        coordinate: { latitude: start.latitude, longitude: start.longitude },
        title: `Отрезок #${n}`,
        rasterSpec: { kind: 'segmentPoint', n },
        zIndex: 100 + n,
      });
      return;
    }
    markers.push({
      id: `route_seg_${n}_start`,
      coordinate: { latitude: start.latitude, longitude: start.longitude },
      title: `Старт #${n}`,
      rasterSpec: { kind: 'start', n },
      zIndex: 100 + n * 2,
    });
    markers.push({
      id: `route_seg_${n}_end`,
      coordinate: { latitude: end.latitude, longitude: end.longitude },
      title: `Финиш #${n}`,
      rasterSpec: { kind: 'end', n },
      zIndex: 101 + n * 2,
    });
  });
  return mergeCoincidentLogicalSegmentMarkers(markers);
}
