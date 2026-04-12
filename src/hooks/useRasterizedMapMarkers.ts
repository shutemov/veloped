import React from 'react';
import type { MarkerConfig } from 'expo-osm-sdk';
import type { LogicalMapMarker } from '../types/segmentMarkers';
import { segmentRasterSpecKey } from '../types/segmentMarkers';
import { useSegmentMarkerRaster } from '../components/map/SegmentMarkerRasterProvider';

/**
 * Превращает логические маркеры (спека растра) в `MarkerConfig` с `icon.uri` после снимка View.
 */
export function useRasterizedMapMarkers(logical: LogicalMapMarker[]): {
  markers: MarkerConfig[];
  loading: boolean;
} {
  const { rasterize } = useSegmentMarkerRaster();
  const [markers, setMarkers] = React.useState<MarkerConfig[]>([]);
  const [loading, setLoading] = React.useState(true);

  const stableKey = React.useMemo(
    () => logical.map((m) => `${m.id}:${segmentRasterSpecKey(m.rasterSpec)}`).join('|'),
    [logical]
  );

  React.useEffect(() => {
    let cancelled = false;
    if (logical.length === 0) {
      setMarkers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const out: MarkerConfig[] = [];
      for (const lm of logical) {
        try {
          const uri = await rasterize(lm.rasterSpec);
          if (cancelled) {
            return;
          }
          out.push({
            id: lm.id,
            coordinate: lm.coordinate,
            title: lm.title,
            icon: { uri, size: 128, anchor: { x: 0.5, y: 0.5 } },
            zIndex: lm.zIndex,
          });
        } catch {
          /* пропуск отдельного маркера */
        }
      }
      if (!cancelled) {
        setMarkers(out);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stableKey, logical, rasterize]);

  return { markers, loading };
}
