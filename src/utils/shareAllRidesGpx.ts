import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ride } from '../types';
import { buildGpxFromRides } from './gpx';

export class ShareGpxError extends Error {
  constructor(
    message: string,
    readonly code: 'NO_RIDES' | 'NO_CACHE' | 'SHARING_UNAVAILABLE'
  ) {
    super(message);
    this.name = 'ShareGpxError';
  }
}

export type ShareRidesGpxOptions = {
  /** Имя файла, например `veloped-all-routes-123.gpx` */
  fileName: string;
  dialogTitle: string;
};

/**
 * GPX из списка поездок (одна или несколько), запись в кэш и системное меню «Поделиться».
 */
export async function shareRidesAsGpx(
  rides: Ride[],
  options: ShareRidesGpxOptions
): Promise<void> {
  if (rides.length === 0) {
    throw new ShareGpxError('Нет поездок для экспорта', 'NO_RIDES');
  }

  const baseDir = FileSystem.cacheDirectory;
  if (!baseDir) {
    throw new ShareGpxError('Каталог кэша недоступен', 'NO_CACHE');
  }

  const gpx = buildGpxFromRides(rides);
  const safeName = options.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uri = `${baseDir}${safeName}`;

  await FileSystem.writeAsStringAsync(uri, gpx, { encoding: 'utf8' });

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new ShareGpxError('Обмен на этом устройстве недоступен', 'SHARING_UNAVAILABLE');
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/gpx+xml',
    dialogTitle: options.dialogTitle,
  });
}

/** Все сохранённые поездки в одном GPX. */
export async function shareAllRidesAsGpx(rides: Ride[]): Promise<void> {
  return shareRidesAsGpx(rides, {
    fileName: `veloped-all-routes-${Date.now()}.gpx`,
    dialogTitle: 'Поделиться маршрутами (GPX)',
  });
}

/** Одна поездка в GPX. */
export async function shareSingleRideAsGpx(ride: Ride): Promise<void> {
  return shareRidesAsGpx([ride], {
    fileName: `veloped-ride-${ride.id}-${Date.now()}.gpx`,
    dialogTitle: 'Поделиться поездкой (GPX)',
  });
}
