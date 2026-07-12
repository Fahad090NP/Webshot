// Centralized configuration for capture behavior and default settings

import type { WebShotSettings, OutputFormat, DeviceProfile } from './types';

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

export const PRESET_DEVICES: DeviceProfile[] = [
  {
    id: 'iphoneSe',
    name: 'iPhone SE',
    width: 375,
    height: 667,
    mobile: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    category: 'mobile',
  },
  {
    id: 'iphone14Pro',
    name: 'iPhone 14 Pro',
    width: 393,
    height: 852,
    mobile: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    category: 'mobile',
  },
  {
    id: 'ipadAir',
    name: 'iPad Air',
    width: 820,
    height: 1180,
    mobile: true,
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    category: 'tablet',
  },
  {
    id: 'ipadPro',
    name: 'iPad Pro',
    width: 1024,
    height: 1366,
    mobile: true,
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    category: 'tablet',
  },
  {
    id: 'desktopHd',
    name: 'Desktop (1080p)',
    width: 1920,
    height: 1080,
    mobile: false,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    category: 'desktop',
  },
  {
    id: 'desktop4k',
    name: 'Desktop (4K)',
    width: 3840,
    height: 2160,
    mobile: false,
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    category: 'desktop',
  },
];

export const DEFAULT_SETTINGS: WebShotSettings = {
  zoomCapture: true,
  blockInteractions: true,
  showZoomWarning: true,
  defaultFormat: 'png',
  defaultScale: 2,
  defaultQuality: 0.92,
  autoDownload: true,
  scrollPad: 200,
  captureDelay: 150,
  customDevices: [],
  activeEngine: 'classic',
  activeDeviceId: 'current',
  pdfMultiPage: false,
  filenameTemplate: 'webshot-{title}-{date}-{time}',
  maxHistoryItems: 50,
};

export const FORMAT_MIME: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
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
