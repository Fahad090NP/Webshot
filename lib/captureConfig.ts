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

const VALID_FORMATS: OutputFormat[] = ['png', 'jpeg', 'webp', 'svg', 'pdf'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return fallback;
}

function normalizeFormat(value: unknown): OutputFormat {
  return VALID_FORMATS.includes(value as OutputFormat)
    ? (value as OutputFormat)
    : CAPTURE.DEFAULT_FORMAT;
}

function normalizeSettings(
  raw: Partial<WebShotSettings> | undefined,
): WebShotSettings {
  const source = raw ?? {};
  return {
    zoomCapture: normalizeBoolean(
      source.zoomCapture,
      DEFAULT_SETTINGS.zoomCapture,
    ),
    blockInteractions: normalizeBoolean(
      source.blockInteractions,
      DEFAULT_SETTINGS.blockInteractions,
    ),
    showZoomWarning: normalizeBoolean(
      source.showZoomWarning,
      DEFAULT_SETTINGS.showZoomWarning,
    ),
    defaultFormat: normalizeFormat(source.defaultFormat),
    defaultScale: Math.round(
      clamp(
        Number(source.defaultScale) || CAPTURE.DEFAULT_SCALE,
        CAPTURE.MIN_SCALE,
        CAPTURE.MAX_SCALE,
      ),
    ),
    defaultQuality: clamp(
      Number(source.defaultQuality) || DEFAULT_SETTINGS.defaultQuality,
      0.1,
      1,
    ),
    scrollPad: Math.round(
      clamp(Number(source.scrollPad) || DEFAULT_SETTINGS.scrollPad, 0, 1000),
    ),
    captureDelay: Math.round(
      clamp(
        Number(source.captureDelay) || DEFAULT_SETTINGS.captureDelay,
        0,
        5000,
      ),
    ),
  };
}

export async function loadSettings(): Promise<WebShotSettings> {
  try {
    const result: { settings?: Partial<WebShotSettings> } =
      await browser.storage.local.get('settings');
    if (result.settings != null) {
      return normalizeSettings(result.settings);
    }
  } catch {
    // storage unavailable, use defaults
  }
  return normalizeSettings(DEFAULT_SETTINGS);
}

export async function saveSettings(settings: WebShotSettings): Promise<void> {
  await browser.storage.local.set({ settings: normalizeSettings(settings) });
}

export interface LastCapturePrefs {
  scale: number;
  format: OutputFormat;
}

const LAST_PREFS_KEY = 'lastCapturePrefs';

export async function loadLastCapturePrefs(): Promise<LastCapturePrefs | null> {
  try {
    const result: { lastCapturePrefs?: LastCapturePrefs } =
      await browser.storage.local.get(LAST_PREFS_KEY);
    return result.lastCapturePrefs ?? null;
  } catch {
    return null;
  }
}

export async function saveLastCapturePrefs(
  prefs: LastCapturePrefs,
): Promise<void> {
  await browser.storage.local.set({ lastCapturePrefs: prefs });
}
