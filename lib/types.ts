// Shared type definitions and interfaces for the Webshot extension.

export interface CapturedImage {
  x: number;
  y: number;
  width: number;
  height: number;
  dataUri: string;
}

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

export interface WebShotSettings {
  blockInteractions: boolean;
  showZoomWarning: boolean;
  defaultFormat: OutputFormat;
  defaultScale: number;
  defaultQuality: number;
  scrollPad: number;
  captureDelay: number;
}
