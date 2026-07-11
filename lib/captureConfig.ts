// Centralized configuration for capture behavior

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
  DEFAULT_FORMAT: 'png' as const,
  DEFAULT_QUALITY: 0.92,
  JPEG_QUALITY: 0.92,
  WEBP_QUALITY: 0.9,
} as const;

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
