// Shared types for the Webshot extension

export type CaptureMode = 'fullPage' | 'viewport' | 'selection';

export type OutputFormat = 'png' | 'jpeg' | 'webp' | 'svg' | 'pdf';

export interface CaptureRequest {
  mode: CaptureMode;
  format: OutputFormat;
  scale: number; // 1-10
  quality?: number; // 0-1, for lossy formats
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

export interface ScrollPosition {
  x: number;
  y: number;
}

export interface CaptureProgress {
  complete: number; // 0-1
}

export type CaptureMessage =
  | { type: 'captureRequest'; data: CaptureRequest }
  | { type: 'scrollPage'; data: PageDimensions }
  | { type: 'captureTile'; data: CaptureTile & { dataUri: string } }
  | { type: 'captureComplete' }
  | { type: 'captureProgress'; data: CaptureProgress }
  | {
      type: 'selectionResult';
      data: { x: number; y: number; width: number; height: number } | null;
    };
