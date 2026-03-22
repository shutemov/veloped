import * as Device from 'expo-device';

/** Сегменты имени файла GPX: только безопасные для кэша символы. */
export function sanitizeGpxFileNamePart(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function getGpxExportDeviceModelSegment(): string {
  const raw =
    Device.modelName?.trim() ||
    [Device.brand, Device.modelId].filter(Boolean).join('_') ||
    'unknown';
  return sanitizeGpxFileNamePart(raw.replace(/\s+/g, '_'));
}

/**
 * `veloped-{model}-{all|single}-{timestamp}.gpx`
 */
export function buildGpxExportFileName(scope: 'all' | 'single'): string {
  const model = getGpxExportDeviceModelSegment();
  const ts = Date.now();
  const withoutExt = `veloped-${model}-${scope}-${ts}`;
  return `${sanitizeGpxFileNamePart(withoutExt)}.gpx`;
}
