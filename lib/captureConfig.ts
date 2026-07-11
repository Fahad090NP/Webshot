// Centralized configuration for capture behavior and default settings

import type { WebShotSettings, OutputFormat } from './types';

export const CAPTURE = {
  SCROLL_PAD: 200,
  CAPTURE_DELAY: 150,
  EXECUTE_TIMEOUT: 3000,
  MAX_PRIMARY_DIMENSION: 15000 * 2,
  MAX_SECONDARY_DIMENSION: 4000 * 2,
  MAX_AREA: 15000 * 2 * (4000 * 2),
  MIN_SCALE: 1,
  MAX_SCALE: 10,
  DEFAULT_SCALE: 2,
  DEFAULT_FORMAT: 'png' as OutputFormat,
  DEFAULT_QUALITY: 0.92,
} as const;

export const DEFAULT_SETTINGS: WebShotSettings = {
  zoomCapture: true,
  blockInteractions: true,
  showZoomWarning: true,
  defaultFormat: 'png',
  defaultScale: 2,
  defaultQuality: 0.92,
  scrollPad: 200,
  captureDelay: 150,
};

export const FORMAT_EXTENSIONS: Record<string, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
  svg: 'svg',
  pdf: 'pdf',
};

export async function loadSettings(): Promise<WebShotSettings> {
  try {
    const result: { settings?: WebShotSettings } =
      await browser.storage.local.get('settings');
    if (result.settings != null) {
      return { ...DEFAULT_SETTINGS, ...result.settings };
    }
  } catch {
    // storage unavailable, use defaults
  }
  return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(settings: WebShotSettings): Promise<void> {
  await browser.storage.local.set({ settings });
}
