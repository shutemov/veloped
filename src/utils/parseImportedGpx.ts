import { XMLParser } from 'fast-xml-parser';
import * as Crypto from 'expo-crypto';
import type { Coordinate, ImportKind, Ride } from '../types';
import { calculateTotalDistance } from './haversine';

const MIN_TRACK_POINTS = 2;

export class GpxImportError extends Error {
  constructor(
    message: string,
    readonly code: 'PARSE' | 'NO_TRACKS' | 'EMPTY'
  ) {
    super(message);
    this.name = 'GpxImportError';
  }
}

type ParseOptions = {
  importBatchId: string;
  importedAt: number;
  /** Имя файла или подпись для sourceDeviceLabel */
  fileLabel?: string;
};

function xmlText(val: unknown): string | undefined {
  if (val == null) return undefined;
  if (typeof val === 'string') {
    const t = val.trim();
    return t.length > 0 ? t : undefined;
  }
  if (typeof val === 'object' && val !== null && '#text' in val) {
    const raw = (val as { '#text': unknown })['#text'];
    if (typeof raw === 'string') {
      const t = raw.trim();
      return t.length > 0 ? t : undefined;
    }
  }
  return undefined;
}

function ensureArray<T>(x: T | T[] | undefined | null): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

function parseTrkptTime(iso: string | undefined): number | null {
  if (!iso || typeof iso !== 'string') return null;
  const ms = Date.parse(iso.trim());
  return Number.isFinite(ms) ? ms : null;
}

function collectTrackPoints(trk: Record<string, unknown>): Coordinate[] {
  const segs = ensureArray(trk.trkseg as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const coords: Coordinate[] = [];
  let syntheticBase: number | null = null;

  for (const seg of segs) {
    const pts = ensureArray(seg.trkpt as Record<string, unknown> | Record<string, unknown>[] | undefined);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const lat = parseFloat(String(p['@_lat'] ?? ''));
      const lon = parseFloat(String(p['@_lon'] ?? ''));
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const timeRaw = xmlText(p.time);
      let timestamp = timeRaw != null ? parseTrkptTime(timeRaw) : null;
      if (timestamp == null) {
        if (syntheticBase == null) syntheticBase = Date.now();
        timestamp = syntheticBase + coords.length * 1000;
      }

      coords.push({ latitude: lat, longitude: lon, timestamp });
    }
  }

  return coords;
}

function rideFromTrack(params: {
  coordinates: Coordinate[];
  importBatchId: string;
  importedAt: number;
  importKind: ImportKind;
  sourceAppName?: string;
  sourceDeviceLabel?: string;
}): Ride | null {
  const { coordinates, importBatchId, importedAt, importKind, sourceAppName, sourceDeviceLabel } = params;
  if (coordinates.length < MIN_TRACK_POINTS) return null;

  const sorted = [...coordinates].sort((a, b) => a.timestamp - b.timestamp);
  const startTime = sorted[0]!.timestamp;
  const endTime = sorted[sorted.length - 1]!.timestamp;
  const durationSeconds = Math.max(0, Math.round((endTime - startTime) / 1000));
  const distanceKm = calculateTotalDistance(sorted);

  return {
    id: `import_${Crypto.randomUUID()}`,
    startTime,
    endTime,
    durationSeconds,
    distanceKm,
    coordinates: sorted,
    source: 'imported',
    importedAt,
    sourceAppName,
    sourceDeviceLabel,
    importKind,
    importBatchId,
  };
}

/**
 * Разбор GPX 1.x: по одному Ride на каждый непустой элемент trk.
 */
export function parseImportedGpx(xml: string, options: ParseOptions): Ride[] {
  const trimmed = xml.trim();
  if (!trimmed) {
    throw new GpxImportError('Файл пустой', 'EMPTY');
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    trimValues: true,
  });

  let root: Record<string, unknown>;
  try {
    root = parser.parse(trimmed) as Record<string, unknown>;
  } catch {
    throw new GpxImportError('Не удалось разобрать GPX (некорректный XML)', 'PARSE');
  }

  const gpx = root.gpx as Record<string, unknown> | undefined;
  if (!gpx || typeof gpx !== 'object') {
    throw new GpxImportError('В файле нет корневого элемента GPX', 'PARSE');
  }

  const creatorRaw = gpx['@_creator'];
  const creator =
    typeof creatorRaw === 'string' && creatorRaw.trim().length > 0 ? creatorRaw.trim() : undefined;

  const metadata = gpx.metadata as Record<string, unknown> | undefined;
  const metaName = metadata ? xmlText(metadata.name) : undefined;

  const tracks = ensureArray(gpx.trk as Record<string, unknown> | Record<string, unknown>[] | undefined);
  if (tracks.length === 0) {
    throw new GpxImportError('В файле нет треков (trk)', 'NO_TRACKS');
  }

  const rides: Ride[] = [];
  const { importBatchId, importedAt, fileLabel } = options;
  const sourceDeviceLabel = fileLabel?.trim() || 'Файл GPX';

  for (let t = 0; t < tracks.length; t++) {
    const trk = tracks[t];
    const trkName = xmlText(trk.name);
    const coords = collectTrackPoints(trk);
    const sourceAppName = trkName ?? metaName ?? creator;
    const importKind: ImportKind = tracks.length > 1 ? 'bundle_all' : 'single_track';
    const ride = rideFromTrack({
      coordinates: coords,
      importBatchId,
      importedAt,
      importKind,
      sourceAppName,
      sourceDeviceLabel,
    });
    if (ride) rides.push(ride);
  }

  if (rides.length === 0) {
    throw new GpxImportError(
      `Нет треков с минимум ${MIN_TRACK_POINTS} точками GPS`,
      'NO_TRACKS'
    );
  }

  return rides;
}
