import { Ride } from '../types';
import { formatDate, formatTime } from './formatters';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toIsoTime(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  try {
    return new Date(ms).toISOString();
  } catch {
    return null;
  }
}

/** Порядок точек как на экране детали поездки: по времени, иначе по индексу. */
function normalizedTrackPoints(ride: Ride) {
  const coords = ride.coordinates ?? [];
  const mapped = coords
    .map((c, index) => ({
      latitude: Number(c.latitude),
      longitude: Number(c.longitude),
      timestamp: Number(c.timestamp),
      originalIndex: index,
    }))
    .filter((c) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude));

  return mapped.sort((a, b) => {
    const aHasTime = Number.isFinite(a.timestamp);
    const bHasTime = Number.isFinite(b.timestamp);
    if (aHasTime && bHasTime) {
      return a.timestamp - b.timestamp;
    }
    return a.originalIndex - b.originalIndex;
  });
}

function rideTrackName(ride: Ride): string {
  const label = `${formatDate(ride.startTime)} ${formatTime(ride.startTime)}`;
  return escapeXml(label);
}

/**
 * Один GPX-файл: по одному &lt;trk&gt; на каждую поездку (все маршруты в одном файле).
 */
export function buildGpxFromRides(rides: Ride[]): string {
  const nowIso = new Date().toISOString();
  const tracks = rides.map((ride) => {
    const points = normalizedTrackPoints(ride);
    const trkpts = points
      .map((p) => {
        const lat = p.latitude.toFixed(7);
        const lon = p.longitude.toFixed(7);
        const t = toIsoTime(p.timestamp);
        const timeTag = t ? `\n        <time>${t}</time>` : '';
        return `      <trkpt lat="${lat}" lon="${lon}">${timeTag}\n      </trkpt>`;
      })
      .join('\n');

    const desc = escapeXml(
      `Дистанция ${ride.distanceKm.toFixed(2)} км, ${ride.durationSeconds} с, точек: ${points.length}`
    );

    const segment = trkpts ? `\n${trkpts}\n    ` : '';
    return `  <trk>
    <name>${rideTrackName(ride)}</name>
    <desc>${desc}</desc>
    <trkseg>${segment}</trkseg>
  </trk>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="veloped" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>Все поездки</name>
    <time>${nowIso}</time>
    <desc>${rides.length} поездок</desc>
  </metadata>
${tracks.join('\n')}
</gpx>
`;
}
