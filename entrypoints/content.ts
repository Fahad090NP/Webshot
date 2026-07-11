// Content script: measures page, scrolls grid, composites tiles, exports result

import type { CaptureRequest, PageDimensions, CaptureTile } from '@/lib/types';
import {
  computeScrollGrid,
  initCompositeCanvases,
  filterTiles,
  canvasToBlob,
} from '@/lib/captureEngine';
import { CAPTURE } from '@/lib/captureConfig';

let currentRequest: CaptureRequest | null = null;
let capturedImages: Array<{ x: number; y: number; dataUri: string }> = [];
let scrollTiles: CaptureTile[] = [];
let currentTileIndex = 0;
let totalWidth = 0;
let totalHeight = 0;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener(
      (message: unknown, _sender: { tab?: { id?: number } }) => {
        const msg = message as Record<string, unknown>;
        const type = msg.type as string | undefined;

        if (type === 'startCapture') {
          void startCapture(msg.data as CaptureRequest);
        }
        return false;
      },
    );
  },
});

function getPageDimensions(): PageDimensions {
  const body = document.body;
  const widths = [
    document.documentElement.clientWidth,
    body ? body.scrollWidth : 0,
    document.documentElement.scrollWidth,
    body ? body.offsetWidth : 0,
    document.documentElement.offsetWidth,
  ];
  const heights = [
    document.documentElement.clientHeight,
    body ? body.scrollHeight : 0,
    document.documentElement.scrollHeight,
    body ? body.offsetHeight : 0,
    document.documentElement.offsetHeight,
  ];
  return {
    fullWidth: Math.max(...widths),
    fullHeight: Math.max(...heights),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  };
}

async function startCapture(request: CaptureRequest): Promise<void> {
  currentRequest = request;
  capturedImages = [];
  currentTileIndex = 0;

  if (request.mode === 'viewport') {
    const dims = getPageDimensions();
    const tile: CaptureTile = {
      x: 0,
      y: 0,
      width: dims.viewportWidth,
      height: dims.viewportHeight,
    };
    const result = await requestCapture(tile);
    capturedImages.push({ x: 0, y: 0, dataUri: result.dataUri });
    totalWidth = dims.viewportWidth;
    totalHeight = dims.viewportHeight;
    await finalizeCapture();
    return;
  }

  const dims = getPageDimensions();
  totalWidth = dims.fullWidth;
  totalHeight = dims.fullHeight;
  scrollTiles = computeScrollGrid(dims);

  await processNextTile();
}

function requestCapture(tile: CaptureTile): Promise<{ dataUri: string }> {
  const scrollX = tile.x;
  const scrollY = tile.y;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Capture timeout')),
      CAPTURE.EXECUTE_TIMEOUT,
    );

    window.scrollTo(scrollX, scrollY);

    setTimeout(() => {
      browser.runtime.sendMessage(
        { type: 'requestCapture', data: { x: scrollX, y: scrollY } },
        (response) => {
          clearTimeout(timeout);
          const resp = response as
            { dataUri?: string; error?: string } | undefined;
          if (resp?.dataUri) {
            resolve({ dataUri: resp.dataUri });
          } else {
            reject(new Error(resp?.error ?? 'Capture failed'));
          }
        },
      );
    }, CAPTURE.CAPTURE_DELAY);
  });
}

async function processNextTile(): Promise<void> {
  if (currentTileIndex >= scrollTiles.length) {
    await finalizeCapture();
    return;
  }

  const tile = scrollTiles[currentTileIndex] as CaptureTile;
  try {
    const result = await requestCapture(tile);
    capturedImages.push({ x: tile.x, y: tile.y, dataUri: result.dataUri });

    browser.runtime.sendMessage({
      type: 'captureProgress',
      data: { complete: (currentTileIndex + 1) / scrollTiles.length },
    });

    currentTileIndex++;
    await processNextTile();
  } catch (err) {
    console.error('Capture failed:', err);
    await finalizeCapture();
  }
}

async function finalizeCapture(): Promise<void> {
  if (!currentRequest || capturedImages.length === 0) return;

  const format = currentRequest.format;
  const scale = currentRequest.scale;
  const quality = currentRequest.quality;

  const blob = await compositeAndExport(format, scale, quality);

  browser.runtime.sendMessage({
    type: 'captureBlob',
    data: { blob, filename: getFilename(format) },
  });

  cleanup();
}

async function compositeAndExport(
  format: string,
  scale: number,
  quality?: number,
): Promise<Blob> {
  const scaledW = Math.round(totalWidth * scale);
  const scaledH = Math.round(totalHeight * scale);
  const tiles = initCompositeCanvases(scaledW, scaledH);

  for (const img of capturedImages) {
    await drawImageOnTiles(img, scale, tiles);
  }

  if (tiles.length === 1) {
    return canvasToBlob(
      tiles[0]?.canvas as HTMLCanvasElement,
      format as CaptureRequest['format'],
      quality,
    );
  }

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = scaledW;
  finalCanvas.height = scaledH;
  const finalCtx = finalCanvas.getContext('2d') as CanvasRenderingContext2D;
  for (const tile of tiles) {
    finalCtx.drawImage(tile.canvas, tile.left, tile.top);
  }
  return canvasToBlob(finalCanvas, format as CaptureRequest['format'], quality);
}

function drawImageOnTiles(
  img: { x: number; y: number; dataUri: string },
  scale: number,
  tiles: ReturnType<typeof initCompositeCanvases>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const relevantTiles = filterTiles(
        img.x * scale,
        img.y * scale,
        image.width,
        image.height,
        tiles,
      );
      for (const tile of relevantTiles) {
        tile.ctx.drawImage(
          image,
          img.x * scale - tile.left,
          img.y * scale - tile.top,
        );
      }
      resolve();
    };
    image.onerror = () => reject(new Error('Failed to load captured image'));
    image.src = img.dataUri;
  });
}

function getFilename(format: string): string {
  const url = window.location.href;
  const path = url.split('?')[0]?.split('#')[0] ?? '';
  const name = path
    .replace(/^https?:\/\//, '')
    .replace(/[^A-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^_+-/, '')
    .replace(/_+-$/, '');
  return `webshot-${name || 'page'}-${Date.now()}.${format}`;
}

function cleanup(): void {
  currentRequest = null;
  capturedImages = [];
  scrollTiles = [];
  currentTileIndex = 0;
}
