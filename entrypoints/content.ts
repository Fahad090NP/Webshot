// Content script: page measurement, scroll grid, zoom capture, selection UI, composite & export

import type {
  CaptureRequest,
  PageDimensions,
  CaptureTile,
  WebShotSettings,
} from '@/lib/types';
import {
  renderToCanvas,
  canvasToBlob,
  computeScrollGrid,
} from '@/lib/captureEngine';
import { CAPTURE, loadSettings } from '@/lib/captureConfig';

let currentRequest: CaptureRequest | null = null;
let currentSettings: WebShotSettings | null = null;
let capturedImages: Array<{ x: number; y: number; dataUri: string }> = [];
let scrollTiles: CaptureTile[] = [];
let currentTileIndex: number = 0;
let totalWidth: number = 0;
let totalHeight: number = 0;
let originalZoom: string = '1';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main(): void {
    browser.runtime.onMessage.addListener(
      (message: unknown, _sender: { tab?: { id?: number } }): false => {
        const msg: Record<string, unknown> = message as Record<string, unknown>;
        const msgType: string | undefined = msg.type as string | undefined;

        if (msgType === 'startCapture') {
          startCapture(msg.data as CaptureRequest).catch((): void => {});
        }
        return false;
      },
    );
  },
});

function getPageDimensions(): PageDimensions {
  const docEl: HTMLElement = document.documentElement;
  const body: HTMLElement = document.body;
  const widths: number[] = [
    docEl.clientWidth,
    body.scrollWidth,
    docEl.scrollWidth,
    body.offsetWidth,
    docEl.offsetWidth,
  ];
  const heights: number[] = [
    docEl.clientHeight,
    body.scrollHeight,
    docEl.scrollHeight,
    body.offsetHeight,
    docEl.offsetHeight,
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
  currentSettings = await loadSettings();
  capturedImages = [];
  currentTileIndex = 0;
  originalZoom = document.body.style.zoom || '1';

  if (request.mode === 'viewport') {
    await captureViewport();
  } else if (request.mode === 'selection') {
    await captureSelection();
  } else {
    await captureFullPage();
  }
}

function applyZoom(scale: number): void {
  if (scale > 1 && currentSettings?.zoomCapture === true) {
    document.body.style.zoom = String(scale);
  }
}

function resetZoom(): void {
  document.body.style.zoom = originalZoom;
}

function blockInteractions(block: boolean): void {
  if (currentSettings?.blockInteractions !== true) return;
  const styleId: string = 'ws-interaction-block';
  const existing: HTMLStyleElement | null = document.getElementById(
    styleId,
  ) as HTMLStyleElement | null;

  if (block) {
    if (existing == null) {
      const styleEl: HTMLStyleElement = document.createElement('style');
      styleEl.id = styleId;
      styleEl.textContent =
        'body{user-select:none!important;pointer-events:none!important}' +
        '.ws-overlay,.ws-box,.ws-hint{pointer-events:auto!important}';
      document.head.appendChild(styleEl);
    }
  } else {
    if (existing != null) existing.remove();
  }
}

async function captureViewport(): Promise<void> {
  const dims: PageDimensions = getPageDimensions();

  applyZoom(currentRequest?.scale ?? 1);
  blockInteractions(true);

  try {
    const result: { dataUri: string } = await requestCapture({
      x: 0,
      y: 0,
      width: dims.viewportWidth,
      height: dims.viewportHeight,
    });
    capturedImages.push({ x: 0, y: 0, dataUri: result.dataUri });
    totalWidth = dims.viewportWidth;
    totalHeight = dims.viewportHeight;
    await finalizeCapture();
  } finally {
    resetZoom();
    blockInteractions(false);
  }
}

async function captureFullPage(): Promise<void> {
  const dims: PageDimensions = getPageDimensions();
  totalWidth = dims.fullWidth;
  totalHeight = dims.fullHeight;
  scrollTiles = computeScrollGrid(dims);

  applyZoom(currentRequest?.scale ?? 1);
  blockInteractions(true);

  try {
    await processNextTile();
  } finally {
    resetZoom();
    blockInteractions(false);
  }
}

async function captureSelection(): Promise<void> {
  const sel: { x: number; y: number; width: number; height: number } | null =
    await waitForSelection();
  if (sel == null) {
    browser.runtime
      .sendMessage({ type: 'captureCancelled' })
      .catch((): void => {});
    return;
  }

  totalWidth = sel.width;
  totalHeight = sel.height;

  applyZoom(currentRequest?.scale ?? 1);
  blockInteractions(true);

  try {
    if (sel.width <= window.innerWidth && sel.height <= window.innerHeight) {
      const result: { dataUri: string } = await requestCapture({
        x: sel.x,
        y: sel.y,
        width: sel.width,
        height: sel.height,
      });
      capturedImages.push({ x: sel.x, y: sel.y, dataUri: result.dataUri });
      await finalizeCapture();
      return;
    }

    const dims: PageDimensions = getPageDimensions();
    const clippedDims: PageDimensions = {
      fullWidth: sel.width,
      fullHeight: sel.height,
      viewportWidth: dims.viewportWidth,
      viewportHeight: dims.viewportHeight,
      devicePixelRatio: dims.devicePixelRatio,
    };
    scrollTiles = computeScrollGrid(clippedDims).map(
      (t: CaptureTile): CaptureTile => ({
        x: t.x + sel.x,
        y: t.y + sel.y,
        width: t.width,
        height: t.height,
      }),
    );
    await processNextTile();
  } finally {
    resetZoom();
    blockInteractions(false);
  }
}

function requestCapture(tile: CaptureTile): Promise<{ dataUri: string }> {
  return new Promise<{ dataUri: string }>(
    (
      resolve: (result: { dataUri: string }) => void,
      reject: (err: Error) => void,
    ): void => {
      const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
        reject(new Error('Capture timeout'));
      }, CAPTURE.EXECUTE_TIMEOUT);

      window.scrollTo(tile.x, tile.y);

      setTimeout((): void => {
        browser.runtime.sendMessage(
          { type: 'requestCapture', data: { x: tile.x, y: tile.y } },
          (response: unknown): void => {
            clearTimeout(timeoutId);
            const resp: { dataUri?: string; error?: string } | undefined =
              response as { dataUri?: string; error?: string } | undefined;
            if (resp?.dataUri != null) {
              resolve({ dataUri: resp.dataUri });
            } else {
              const errorMsg: string = resp?.error ?? 'Capture failed';
              reject(new Error(errorMsg));
            }
          },
        );
      }, CAPTURE.CAPTURE_DELAY);
    },
  );
}

async function processNextTile(): Promise<void> {
  if (currentTileIndex >= scrollTiles.length) {
    await finalizeCapture();
    return;
  }

  const tile: CaptureTile = scrollTiles[currentTileIndex];
  try {
    const result: { dataUri: string } = await requestCapture(tile);
    capturedImages.push({ x: tile.x, y: tile.y, dataUri: result.dataUri });

    browser.runtime
      .sendMessage({
        type: 'captureProgress',
        data: { complete: (currentTileIndex + 1) / scrollTiles.length },
      })
      .catch((): void => {});

    currentTileIndex++;
    await processNextTile();
  } catch {
    await finalizeCapture();
  }
}

async function finalizeCapture(): Promise<void> {
  if (currentRequest == null || capturedImages.length === 0) {
    return;
  }

  const blob: Blob = await exportCapture();
  browser.runtime
    .sendMessage({
      type: 'captureBlob',
      data: { blob, filename: getFilename(currentRequest.format) },
    })
    .catch((): void => {});
  cleanup();
}

async function exportCapture(): Promise<Blob> {
  const r: CaptureRequest = currentRequest as CaptureRequest;

  if (r.format === 'svg') {
    return exportAsSvg(r);
  }

  if (r.format === 'pdf') {
    return exportAsPdf(r);
  }

  const canvas: HTMLCanvasElement = await renderToCanvas(
    capturedImages,
    totalWidth,
    totalHeight,
    r.scale,
  );
  return canvasToBlob(canvas, r.format, r.quality);
}

async function exportAsSvg(r: CaptureRequest): Promise<Blob> {
  const canvas: HTMLCanvasElement = await renderToCanvas(
    capturedImages,
    totalWidth,
    totalHeight,
    r.scale,
  );
  const pngDataUri: string = canvas.toDataURL('image/png');
  const scaledW: number = Math.round(totalWidth * r.scale);
  const scaledH: number = Math.round(totalHeight * r.scale);
  const svg: string =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scaledW}" height="${scaledH}" viewBox="0 0 ${scaledW} ${scaledH}">` +
    `<image href="${pngDataUri}" width="${scaledW}" height="${scaledH}"/>` +
    '</svg>';
  return new Blob([svg], { type: 'image/svg+xml' });
}

async function exportAsPdf(r: CaptureRequest): Promise<Blob> {
  const { jsPDF: JsPdfClass } = await import('jspdf');
  const scaledW: number = Math.round(totalWidth * r.scale);
  const scaledH: number = Math.round(totalHeight * r.scale);
  const canvas: HTMLCanvasElement = await renderToCanvas(
    capturedImages,
    totalWidth,
    totalHeight,
    r.scale,
  );
  const dataUri: string = canvas.toDataURL('image/png');
  const doc: InstanceType<typeof JsPdfClass> = new JsPdfClass({
    orientation: scaledW > scaledH ? 'landscape' : 'portrait',
    unit: 'px',
    format: [scaledW, scaledH],
  });
  doc.addImage(dataUri, 'PNG', 0, 0, scaledW, scaledH);
  const pdfOutput: ArrayBuffer = doc.output('arraybuffer');
  return new Blob([pdfOutput], { type: 'application/pdf' });
}

function getFilename(format: string): string {
  const url: string = window.location.href;
  const path: string = url.split('?')[0]?.split('#')[0] ?? '';
  const name: string = path
    .replace(/^https?:\/\//, '')
    .replace(/[^A-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^_+-/, '')
    .replace(/_+-$/, '');
  return `webshot-${name || 'page'}-${Date.now()}.${format}`;
}

function waitForSelection(): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
} | null> {
  return new Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(
    (
      resolve: (
        result: { x: number; y: number; width: number; height: number } | null,
      ) => void,
    ): void => {
      const style: HTMLStyleElement = document.createElement('style');
      style.textContent =
        '.ws-overlay{position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;cursor:crosshair}' +
        '.ws-box{position:fixed;border:2px solid #1a73e8;background:rgba(26,115,232,0.08);z-index:2147483647;pointer-events:none;display:none}' +
        '.ws-hint{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:#fff;padding:8px 16px;border-radius:8px;font:13px sans-serif;z-index:2147483647;white-space:nowrap}';
      document.head.appendChild(style);

      const hint: HTMLDivElement = document.createElement('div');
      hint.className = 'ws-hint';
      hint.textContent =
        'Click an element or drag to select area. Press Esc to cancel.';
      document.body.appendChild(hint);

      const overlay: HTMLDivElement = document.createElement('div');
      overlay.className = 'ws-overlay';
      document.body.appendChild(overlay);

      const selectionBox: HTMLDivElement = document.createElement('div');
      selectionBox.className = 'ws-box';
      document.body.appendChild(selectionBox);

      let startX: number = 0;
      let startY: number = 0;
      let isSelecting: boolean = false;
      let mode: 'click' | 'drag' | null = null;

      function getElementAtPoint(x: number, y: number): Element | null {
        overlay.style.setProperty('pointer-events', 'none');
        const el: Element | null = document.elementFromPoint(x, y);
        overlay.style.setProperty('pointer-events', '');
        return el;
      }

      function getElementBounds(
        el: Element,
      ): { x: number; y: number; width: number; height: number } | null {
        const rect: DOMRect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        return {
          x: rect.left + window.scrollX,
          y: rect.top + window.scrollY,
          width: rect.width,
          height: rect.height,
        };
      }

      function onMouseDown(e: MouseEvent): void {
        if (e.button !== 0) return;
        isSelecting = true;
        mode = 'drag';
        startX = e.clientX + window.scrollX;
        startY = e.clientY + window.scrollY;
        selectionBox.style.display = 'block';
        selectionBox.style.left = `${e.clientX}px`;
        selectionBox.style.top = `${e.clientY}px`;
        selectionBox.style.width = '0px';
        selectionBox.style.height = '0px';
      }

      function onMouseMove(e: MouseEvent): void {
        if (!isSelecting || mode !== 'drag') {
          selectionBox.style.display = 'none';
          return;
        }
        const x: number = Math.min(e.clientX, startX - window.scrollX);
        const y: number = Math.min(e.clientY, startY - window.scrollY);
        const w: number = Math.abs(e.clientX - (startX - window.scrollX));
        const h: number = Math.abs(e.clientY - (startY - window.scrollY));
        selectionBox.style.left = `${x}px`;
        selectionBox.style.top = `${y}px`;
        selectionBox.style.width = `${w}px`;
        selectionBox.style.height = `${h}px`;
      }

      function onMouseUp(e: MouseEvent): void {
        if (!isSelecting) return;
        isSelecting = false;

        if (mode === 'drag') {
          const dx: number = Math.abs(e.clientX + window.scrollX - startX);
          const dy: number = Math.abs(e.clientY + window.scrollY - startY);

          if (dx < 5 && dy < 5) {
            mode = 'click';
            const el: Element | null = getElementAtPoint(e.clientX, e.clientY);
            if (
              el != null &&
              el !== document.body &&
              el !== document.documentElement
            ) {
              const bounds: {
                x: number;
                y: number;
                width: number;
                height: number;
              } | null = getElementBounds(el);
              if (bounds != null) {
                cleanupListeners();
                resolve(bounds);
                return;
              }
            }
          }

          const x: number = Math.min(startX, e.clientX + window.scrollX);
          const y: number = Math.min(startY, e.clientY + window.scrollY);
          const w: number = Math.abs(e.clientX + window.scrollX - startX);
          const h: number = Math.abs(e.clientY + window.scrollY - startY);

          if (w > 5 && h > 5) {
            cleanupListeners();
            resolve({ x, y, width: w, height: h });
            return;
          }
        }

        cleanupListeners();
        resolve(null);
      }

      function onKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
          cleanupListeners();
          resolve(null);
        }
      }

      function cleanupListeners(): void {
        overlay.remove();
        selectionBox.remove();
        hint.remove();
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
    },
  );
}

function cleanup(): void {
  currentRequest = null;
  currentSettings = null;
  capturedImages = [];
  scrollTiles = [];
  currentTileIndex = 0;
  resetZoom();
  blockInteractions(false);
}
