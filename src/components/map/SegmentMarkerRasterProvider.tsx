import React, { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import ViewShot from 'react-native-view-shot';
import type { SegmentRasterSpec } from '../../types/segmentMarkers';
import { segmentRasterSpecKey } from '../../types/segmentMarkers';
import { SegmentMarkerChip, SEGMENT_MARKER_CAPTURE_SIZE, SEGMENT_MARKER_VIEW_SIZE } from './SegmentMarkerChip';

type Job = {
  spec: SegmentRasterSpec;
  resolve: (uri: string) => void;
  reject: (e: Error) => void;
};

type Ctx = {
  rasterize: (spec: SegmentRasterSpec) => Promise<string>;
};

const SegmentMarkerRasterContext = createContext<Ctx | null>(null);

const FALLBACK_URI = Image.resolveAssetSource(require('../../../assets/markers/pin-end.png')).uri;

export function useSegmentMarkerRaster(): Ctx {
  const ctx = useContext(SegmentMarkerRasterContext);
  if (ctx == null) {
    throw new Error('useSegmentMarkerRaster: оберните приложение в SegmentMarkerRasterProvider');
  }
  return ctx;
}

/**
 * Очередь снимков View → PNG (tmpfile) для `MarkerConfig.icon.uri` (требование expo-osm-sdk / MapLibre).
 */
export function SegmentMarkerRasterProvider({ children }: { children: React.ReactNode }) {
  const cacheRef = useRef<Map<string, string>>(new Map());
  const inflightRef = useRef<Map<string, Promise<string>>>(new Map());
  const queueRef = useRef<Job[]>([]);
  const processingRef = useRef(false);
  const currentJobRef = useRef<Job | null>(null);
  const shotRef = useRef<ViewShot | null>(null);

  const [activeSpec, setActiveSpec] = useState<SegmentRasterSpec | null>(null);

  const pumpRef = useRef<() => void>(() => {});

  const finishJob = useCallback((job: Job, uri: string) => {
    const key = segmentRasterSpecKey(job.spec);
    cacheRef.current.set(key, uri);
    job.resolve(uri);
    currentJobRef.current = null;
    processingRef.current = false;
    setActiveSpec(null);
    queueMicrotask(() => pumpRef.current());
  }, []);

  const pump = useCallback(() => {
    if (processingRef.current) {
      return;
    }
    const next = queueRef.current.shift();
    if (!next) {
      return;
    }
    const key = segmentRasterSpecKey(next.spec);
    const cached = cacheRef.current.get(key);
    if (cached) {
      next.resolve(cached);
      queueMicrotask(() => pumpRef.current());
      return;
    }
    processingRef.current = true;
    currentJobRef.current = next;
    setActiveSpec(next.spec);
  }, []);

  pumpRef.current = pump;

  useLayoutEffect(() => {
    if (!activeSpec) {
      return;
    }
    const job = currentJobRef.current;
    if (!job || segmentRasterSpecKey(job.spec) !== segmentRasterSpecKey(activeSpec)) {
      return;
    }

    let cancelled = false;
    const run = async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (cancelled) {
        return;
      }
      try {
        const cap = shotRef.current?.capture?.bind(shotRef.current);
        if (!cap) {
          throw new Error('ViewShot.capture недоступен');
        }
        const uri = await cap();
        if (cancelled) {
          return;
        }
        finishJob(job, uri);
      } catch {
        if (!cancelled) {
          finishJob(job, FALLBACK_URI);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activeSpec, finishJob]);

  const rasterize = useCallback(
    (spec: SegmentRasterSpec): Promise<string> => {
      const key = segmentRasterSpecKey(spec);
      const hit = cacheRef.current.get(key);
      if (hit) {
        return Promise.resolve(hit);
      }
      const existing = inflightRef.current.get(key);
      if (existing) {
        return existing;
      }
      const p = new Promise<string>((resolve, reject) => {
        queueRef.current.push({ spec, resolve, reject });
        pump();
      });
      inflightRef.current.set(key, p);
      p.finally(() => {
        inflightRef.current.delete(key);
      });
      return p;
    },
    [pump]
  );

  const value = React.useMemo(() => ({ rasterize }), [rasterize]);

  return (
    <SegmentMarkerRasterContext.Provider value={value}>
      {children}
      <View style={styles.offscreen} pointerEvents="none" collapsable={false}>
        <ViewShot
          ref={shotRef}
          options={{
            format: 'png',
            quality: 0.92,
            result: 'tmpfile',
            width: SEGMENT_MARKER_CAPTURE_SIZE,
            height: SEGMENT_MARKER_CAPTURE_SIZE,
          }}
          style={{ width: SEGMENT_MARKER_VIEW_SIZE, height: SEGMENT_MARKER_VIEW_SIZE }}
        >
          <View collapsable={false}>
            {activeSpec ? <SegmentMarkerChip spec={activeSpec} /> : <View style={styles.placeholder} />}
          </View>
        </ViewShot>
      </View>
    </SegmentMarkerRasterContext.Provider>
  );
}

const OFF = 10000;

const styles = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    left: -OFF,
    top: 0,
    width: 200,
    height: 200,
    overflow: 'hidden',
    opacity: 0.99,
  },
  placeholder: {
    width: SEGMENT_MARKER_VIEW_SIZE,
    height: SEGMENT_MARKER_VIEW_SIZE,
  },
});
