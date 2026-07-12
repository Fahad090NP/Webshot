// Local capture history gallery database module: handles saving, loading, clearing, and resizing thumbnails.

import type { CaptureHistoryItem } from './types';

export async function generateThumbnail(
  dataUri: string,
  targetWidth = 150,
): Promise<string> {
  try {
    const res = await fetch(dataUri);
    const blob = await res.blob();
    const imageBitmap = await createImageBitmap(blob);
    const scale = targetWidth / imageBitmap.width;
    const targetHeight = Math.round(imageBitmap.height * scale);

    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(targetWidth, targetHeight);
      const ctx = canvas.getContext('2d');
      if (ctx != null) {
        ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);
        const outBlob = await canvas.convertToBlob({
          type: 'image/jpeg',
          quality: 0.6,
        });
        const buffer = await outBlob.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
          const byte = bytes[i];
          binary += String.fromCharCode(byte);
        }
        const base64 = btoa(binary);
        return `data:image/jpeg;base64,${base64}`;
      }
    } else if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (ctx != null) {
        ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);
        return canvas.toDataURL('image/jpeg', 0.6);
      }
    }
  } catch {
    // fallback
  }
  return dataUri;
}

export async function loadHistory(): Promise<CaptureHistoryItem[]> {
  try {
    const result: { captureHistory?: CaptureHistoryItem[] } =
      await browser.storage.local.get('captureHistory');
    if (result.captureHistory != null) {
      return result.captureHistory;
    }
  } catch {
    // storage not available
  }
  return [];
}

export async function saveHistoryItem(
  item: Omit<CaptureHistoryItem, 'id' | 'timestamp' | 'dataUri'>,
  fullDataUri: string,
  maxItems = 50,
): Promise<CaptureHistoryItem[]> {
  const history = await loadHistory();
  const thumbnail = await generateThumbnail(fullDataUri);

  const newItem: CaptureHistoryItem = {
    ...item,
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    dataUri: thumbnail,
  };

  const updatedHistory = [newItem, ...history].slice(0, maxItems);
  await browser.storage.local.set({ captureHistory: updatedHistory });
  return updatedHistory;
}

export async function deleteHistoryItem(
  id: string,
): Promise<CaptureHistoryItem[]> {
  const history = await loadHistory();
  const updatedHistory = history.filter((h) => h.id !== id);
  await browser.storage.local.set({ captureHistory: updatedHistory });
  return updatedHistory;
}

export async function clearHistory(): Promise<void> {
  await browser.storage.local.set({ captureHistory: [] });
}
