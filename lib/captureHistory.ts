// Local capture history gallery database module: handles saving, loading, clearing, and resizing thumbnails.

import type { CaptureHistoryItem } from './types';

export function generateThumbnail(
  dataUri: string,
  targetWidth = 150,
): Promise<string> {
  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = (): void => {
      const canvas = document.createElement('canvas');
      const scale = targetWidth / img.width;
      canvas.width = targetWidth;
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (ctx != null) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      } else {
        resolve(dataUri);
      }
    };
    img.onerror = (): void => {
      resolve(dataUri);
    };
    img.src = dataUri;
  });
}

export async function loadHistory(): Promise<CaptureHistoryItem[]> {
  try {
    const result: { captureHistory?: CaptureHistoryItem[] } =
      await browser.storage.local.get('captureHistory');
    if (result.captureHistory != null && Array.isArray(result.captureHistory)) {
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
