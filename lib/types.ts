// Shared types for the Webshot extension

export type CaptureMode = 'fullPage' | 'viewport' | 'selection';

export type OutputFormat = 'png' | 'jpeg' | 'webp' | 'svg' | 'pdf';

export interface CaptureRequest {
  mode: CaptureMode;
  format: OutputFormat;
  scale: number;
  quality: number;
}

export interface CaptureTile {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageDimensions {
  fullWidth: number;
  fullHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
}

export interface CaptureProgress {
  complete: number;
}

export interface WebShotSettings {
  zoomCapture: boolean;
  blockInteractions: boolean;
  showZoomWarning: boolean;
  defaultFormat: OutputFormat;
  defaultScale: number;
  defaultQuality: number;
  autoDownload: boolean;
  scrollPad: number;
  captureDelay: number;
}
