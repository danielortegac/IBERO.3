import { ref, uploadBytes, uploadString, getDownloadURL, type UploadMetadata } from 'firebase/storage';
import { storage } from '../firebaseConfig';
import { consumeServerFeature, releaseServerFeature } from './usageService';
import type { FeatureKey } from '../types';

type UploadBinary = Blob | Uint8Array | ArrayBuffer;

const sanitizePathPart = (value: string) => String(value || 'file').replace(/[^a-zA-Z0-9._/-]/g, '_');

export const safeStoragePath = (...parts: string[]) => parts.map(sanitizePathPart).join('/').replace(/\/+/g, '/');

export async function uploadWithQuotaCheck(params: {
  userId: string;
  data: UploadBinary;
  path: string;
  sizeBytes?: number;
  metadata?: UploadMetadata;
  plan?: string;
  featureKey?: FeatureKey;
}) {
  const { userId, data, path, metadata, plan, featureKey = 'storage' } = params;
  const sizeBytes = Math.max(0, Number(params.sizeBytes ?? ((data as Blob).size ?? 0)));
  await consumeServerFeature(featureKey, sizeBytes, { module: 'storage', action: 'upload_file', path });

  const storageRef = ref(storage, path);
  try {
    const snapshot = await uploadBytes(storageRef, data as any, metadata);
    const url = await getDownloadURL(snapshot.ref);
    return { url, ref: snapshot.ref, path, sizeBytes };
  } catch (error) {
    await releaseServerFeature(featureKey, sizeBytes).catch(() => undefined);
    throw error;
  }
}

export async function uploadStringWithQuotaCheck(params: {
  userId: string;
  data: string;
  path: string;
  format?: 'raw' | 'base64' | 'base64url' | 'data_url';
  sizeBytes?: number;
  metadata?: UploadMetadata;
  plan?: string;
  featureKey?: FeatureKey;
}) {
  const { userId, data, path, metadata, plan, featureKey = 'storage' } = params;
  const format = params.format || 'raw';
  const estimatedSize = params.sizeBytes ?? (format === 'base64' || format === 'base64url'
    ? Math.floor((data.length * 3) / 4)
    : format === 'data_url'
      ? Math.floor((data.length * 3) / 4)
      : new Blob([data]).size);

  await consumeServerFeature(featureKey, Math.max(0, estimatedSize), { module: 'storage', action: 'upload_string', path });

  const storageRef = ref(storage, path);
  try {
    await uploadString(storageRef, data, format as any, metadata);
    const url = await getDownloadURL(storageRef);
    return { url, ref: storageRef, path, sizeBytes: Math.max(0, estimatedSize) };
  } catch (error) {
    await releaseServerFeature(featureKey, Math.max(0, estimatedSize)).catch(() => undefined);
    throw error;
  }
}
