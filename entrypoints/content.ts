// Content script: measures page, scrolls grid, composites tiles, exports result

import type { CaptureRequest, PageDimensions, CaptureTile } from '@/lib/types';
import {
  computeScrollGrid,
  renderToCanvas,
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
        } else if (type === 'triggerSelection') {
          void triggerSelection();
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
    await captureViewport();
    return;
  }

  if (request.mode === 'selection') {
    await captureSelection();
    return;
  }

  await captureFullPage();
}

async function captureViewport(): Promise<void> {
  const dims = getPageDimensions();
  const result = await requestCapture({
    x: 0,
    y: 0,
    width: dims.viewportWidth,
    height: dims.viewportHeight,
  });
  capturedImages.push({ x: 0, y: 0, dataUri: result.dataUri });
  totalWidth = dims.viewportWidth;
  totalHeight = dims.viewportHeight;
  await finalizeCapture();
}

async function captureFullPage(): Promise<void> {
  const dims = getPageDimensions();
  totalWidth = dims.fullWidth;
  totalHeight = dims.fullHeight;
  scrollTiles = computeScrollGrid(dims);
  await processNextTile();
}

async function captureSelection(): Promise<void> {
  const sel = await waitForSelection();
  if (!sel) {
    browser.runtime.sendMessage({ type: 'captureCancelled' });
    return;
  }

  totalWidth = sel.width;
  totalHeight = sel.height;

  if (sel.width <= window.innerWidth && sel.height <= window.innerHeight) {
    const result = await requestCapture({
      x: sel.x,
      y: sel.y,
      width: sel.width,
      height: sel.height,
    });
    capturedImages.push({ x: sel.x, y: sel.y, dataUri: result.dataUri });
    await finalizeCapture();
    return;
  }

  const dims = getPageDimensions();
  const clippedDims: PageDimensions = {
    fullWidth: sel.width,
    fullHeight: sel.height,
    viewportWidth: dims.viewportWidth,
    viewportHeight: dims.viewportHeight,
    devicePixelRatio: dims.devicePixelRatio,
  };
  scrollTiles = computeScrollGrid(clippedDims).map((t) => ({
    x: t.x + sel.x,
    y: t.y + sel.y,
    width: t.width,
    height: t.height,
  }));
  await processNextTile();
}

function requestCapture(tile: CaptureTile): Promise<{ dataUri: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Capture timeout')),
      CAPTURE.EXECUTE_TIMEOUT,
    );

    window.scrollTo(tile.x, tile.y);

    setTimeout(() => {
      browser.runtime.sendMessage(
        { type: 'requestCapture', data: { x: tile.x, y: tile.y } },
        (response) => {
          clearTimeout(timeout);
          const resp = response as
            { dataUri?: string; error?: string } | undefined;
          if (resp?.dataUri) resolve({ dataUri: resp.dataUri });
          else reject(new Error(resp?.error ?? 'Capture failed'));
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

  const blob = await exportCapture();
  browser.runtime.sendMessage({
    type: 'captureBlob',
    data: { blob, filename: getFilename(currentRequest.format) },
  });
  cleanup();
}

async function exportCapture(): Promise<Blob> {
  const r = currentRequest as CaptureRequest;

  if (r.format === 'svg') {
    const pngBlob = await exportCaptureWithFormat('png');
    const pngDataUri = await blobToDataUri(pngBlob);
    const scaledW = Math.round(totalWidth * r.scale);
    const scaledH = Math.round(totalHeight * r.scale);
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${scaledW}" height="${scaledH}" viewBox="0 0 ${scaledW} ${scaledH}">
  <image href="${pngDataUri}" width="${scaledW}" height="${scaledH}"/>
</svg>`;
    return new Blob([svg], { type: 'image/svg+xml' });
  }

  if (r.format === 'pdf') {
    const { jsPDF } = await import('jspdf');
    const scaledW = Math.round(totalWidth * r.scale);
    const scaledH = Math.round(totalHeight * r.scale);
    const canvas = await renderToCanvas(
      capturedImages,
      totalWidth,
      totalHeight,
      r.scale,
    );
    const dataUri = canvas.toDataURL('image/png');
    const doc = new jsPDF({
      orientation: scaledW > scaledH ? 'landscape' : 'portrait',
      unit: 'px',
      format: [scaledW, scaledH],
    });
    doc.addImage(dataUri, 'PNG', 0, 0, scaledW, scaledH);
    return new Blob([doc.output('arraybuffer')], { type: 'application/pdf' });
  }

  return exportCaptureWithFormat(r.format);
}

async function exportCaptureWithFormat(format: string): Promise<Blob> {
  const canvas = await renderToCanvas(
    capturedImages,
    totalWidth,
    totalHeight,
    (currentRequest as CaptureRequest).scale,
  );
  const quality = (currentRequest as CaptureRequest).quality;
  return canvasToBlob(canvas, format as CaptureRequest['format'], quality);
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
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

function triggerSelection(): void {
  void waitForSelection();
}

function waitForSelection(): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
} | null> {
  return new Promise((resolve) => {
    let overlay: HTMLDivElement | null = null;
    let selectionBox: HTMLDivElement | null = null;
    let startX = 0;
    let startY = 0;
    let isSelecting = false;
    let mode: 'click' | 'drag' | null = null;

    const style = document.createElement('style');
    style.textContent = `
      .ws-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 2147483647; cursor: crosshair; }
      .ws-box { position: fixed; border: 2px solid #1a73e8; background: rgba(26,115,232,0.08); z-index: 2147483647; pointer-events: none; display: none; }
      .ws-hint { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); background: #1a1a1a; color: #fff; padding: 8px 16px; border-radius: 8px; font: 13px sans-serif; z-index: 2147483647; white-space: nowrap; }
    `;
    document.head.appendChild(style);

    const hint = document.createElement('div');
    hint.className = 'ws-hint';
    hint.textContent =
      'Click an element or drag to select area. Press Esc to cancel.';
    document.body.appendChild(hint);

    overlay = document.createElement('div');
    overlay.className = 'ws-overlay';
    document.body.appendChild(overlay);

    selectionBox = document.createElement('div');
    selectionBox.className = 'ws-box';
    document.body.appendChild(selectionBox);

    function getElementAtPoint(x: number, y: number): Element | null {
      overlay?.style.setProperty('pointer-events', 'none');
      const el = document.elementFromPoint(x, y);
      overlay?.style.setProperty('pointer-events', '');
      return el;
    }

    function getElementBounds(
      el: Element,
    ): { x: number; y: number; width: number; height: number } | null {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      return {
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height,
      };
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return;
      isSelecting = true;
      mode = 'drag';
      startX = e.clientX + window.scrollX;
      startY = e.clientY + window.scrollY;
      (selectionBox as HTMLDivElement).style.display = 'block';
      (selectionBox as HTMLDivElement).style.left = `${e.clientX}px`;
      (selectionBox as HTMLDivElement).style.top = `${e.clientY}px`;
      (selectionBox as HTMLDivElement).style.width = '0px';
      (selectionBox as HTMLDivElement).style.height = '0px';
    }

    function onMouseMove(e: MouseEvent) {
      if (!isSelecting || mode !== 'drag') {
        (selectionBox as HTMLDivElement).style.display = 'none';
        return;
      }
      const x = Math.min(e.clientX, startX - window.scrollX);
      const y = Math.min(e.clientY, startY - window.scrollY);
      const w = Math.abs(e.clientX - (startX - window.scrollX));
      const h = Math.abs(e.clientY - (startY - window.scrollY));
      (selectionBox as HTMLDivElement).style.left = `${x}px`;
      (selectionBox as HTMLDivElement).style.top = `${y}px`;
      (selectionBox as HTMLDivElement).style.width = `${w}px`;
      (selectionBox as HTMLDivElement).style.height = `${h}px`;
    }

    function onMouseUp(e: MouseEvent) {
      if (!isSelecting) return;
      isSelecting = false;

      if (mode === 'drag') {
        const dx = Math.abs(e.clientX + window.scrollX - startX);
        const dy = Math.abs(e.clientY + window.scrollY - startY);

        if (dx < 5 && dy < 5) {
          mode = 'click';
          const el = getElementAtPoint(e.clientX, e.clientY);
          if (el && el !== document.body && el !== document.documentElement) {
            const bounds = getElementBounds(el);
            if (bounds) {
              cleanup();
              resolve(bounds);
              return;
            }
          }
        }

        const x = Math.min(startX, e.clientX + window.scrollX);
        const y = Math.min(startY, e.clientY + window.scrollY);
        const w = Math.abs(e.clientX + window.scrollX - startX);
        const h = Math.abs(e.clientY + window.scrollY - startY);

        if (w > 5 && h > 5) {
          cleanup();
          resolve({ x, y, width: w, height: h });
          return;
        }
      }

      cleanup();
      resolve(null);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        cleanup();
        resolve(null);
      }
    }

    function cleanup() {
      overlay?.remove();
      selectionBox?.remove();
      hint?.remove();
      style.remove();
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyDown);
    }

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keydown', onKeyDown);
  });
}

function cleanup(): void {
  currentRequest = null;
  capturedImages = [];
  scrollTiles = [];
  currentTileIndex = 0;
}
