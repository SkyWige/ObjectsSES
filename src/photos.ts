import { Directory, File, Paths } from 'expo-file-system';
import {
  ImagePickerAsset,
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
} from 'expo-image-picker';
import { Platform } from 'react-native';

const QUALITY = 0.7;

function photoDirectory(): Directory {
  return new Directory(Paths.document, 'photos');
}

/**
 * Picked images start in a temporary cache, so they are copied into app storage.
 * Only the file name is saved: the full path to app storage can change between app updates.
 */
function storeAssets(assets: ImagePickerAsset[]): string[] {
  if (Platform.OS === 'web') return assets.map((asset) => asset.uri);
  const directory = photoDirectory();
  directory.create({ intermediates: true, idempotent: true });
  return assets.map((asset, index) => {
    const extension = asset.uri.match(/\.(\w+)(?:\?.*)?$/)?.[1] ?? 'jpg';
    const name = `${Date.now()}-${index}-${Math.random().toString(36).slice(2)}.${extension}`;
    new File(asset.uri).copy(new File(directory, name));
    return name;
  });
}

export function photoUri(name: string): string {
  if (Platform.OS === 'web') return name;
  return new File(photoDirectory(), name).uri;
}

export async function pickPhotos(): Promise<string[]> {
  const result = await launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    quality: QUALITY,
  });
  return result.canceled ? [] : storeAssets(result.assets);
}

export type CameraResult = { photos: string[]; denied: boolean };

export async function takePhoto(): Promise<CameraResult> {
  const { granted } = await requestCameraPermissionsAsync();
  if (!granted) return { photos: [], denied: true };
  const result = await launchCameraAsync({ mediaTypes: ['images'], quality: QUALITY });
  return { photos: result.canceled ? [] : storeAssets(result.assets), denied: false };
}

export function deletePhotoFiles(names: string[]): void {
  if (Platform.OS === 'web') return;
  for (const name of names) {
    try {
      const file = new File(photoDirectory(), name);
      if (file.exists) file.delete();
    } catch {
      // A leftover file only wastes space, and the row is already gone from the list.
    }
  }
}
