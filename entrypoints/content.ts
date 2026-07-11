// Content script for page measurement, scroll grid orchestration, zoom handling, element selection, and screenshot compositing.

import type {
  CaptureRequest,
  PageDimensions,
  CaptureTile,
  WebShotSettings,
  CapturedImage,
} from '@/lib/types';
import {
  computeScrollGrid,
  compositeAndExport,
  blobToDataUri,
  getFilename,
} from '@/lib/captureEngine';
import { CAPTURE, loadSettings } from '@/lib/captureConfig';

let currentRequest: CaptureRequest | null = null;
let currentSettings: WebShotSettings | null = null;
let capturedImages: CapturedImage[] = [];
let scrollTiles: CaptureTile[] = [];
let currentTileIndex: number = 0;
let totalWidth: number = 0;
let totalHeight: number = 0;
let originalZoom: string = '1';
let isCapturing: boolean = false;

let originalX: number = 0;
let originalY: number = 0;
let originalOverflow: string = '';
let originalBodyOverflowY: string = '';
let captureOffset: { x: number; y: number } = { x: 0, y: 0 };

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
  if (isCapturing) return;
  isCapturing = true;

  try {
    const settings: WebShotSettings = await loadSettings();
    currentRequest = request;
    currentSettings = settings;
    capturedImages = [];
    currentTileIndex = 0;
    totalWidth = 0;
    totalHeight = 0;
    originalZoom = document.body.style.zoom || '1';
    originalX = window.scrollX;
    originalY = window.scrollY;
    captureOffset = { x: 0, y: 0 };

    if (request.mode === 'viewport') {
      await captureViewport();
    } else if (request.mode === 'selection') {
      await captureSelection();
    } else {
      await captureFullPage();
    }
  } finally {
    isCapturing = false;
  }
}

async function applyZoom(scale: number): Promise<void> {
  if (scale > 1 && currentSettings?.zoomCapture === true) {
    document.body.style.zoom = String(scale);
    // Allow layout reflow to settle
    await new Promise((resolve) => setTimeout(resolve, 150));
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

function hideScrollbars(): void {
  originalOverflow = document.documentElement.style.overflow;
  originalBodyOverflowY = document.body.style.overflowY;
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  document.body.style.overflowY = 'hidden';
}

async function captureViewport(): Promise<void> {
  await applyZoom(currentRequest?.scale ?? 1);

  const dims: PageDimensions = getPageDimensions();
  captureOffset = { x: window.scrollX, y: window.scrollY };

  hideScrollbars();
  blockInteractions(true);

  try {
    const result = await requestCapture({
      x: window.scrollX,
      y: window.scrollY,
      width: dims.viewportWidth,
      height: dims.viewportHeight,
    });
    capturedImages.push({
      x: 0,
      y: 0,
      width: dims.viewportWidth,
      height: dims.viewportHeight,
      dataUri: result.dataUri,
    });
    totalWidth = dims.viewportWidth;
    totalHeight = dims.viewportHeight;
    await finalizeCapture();
  } finally {
    resetZoom();
    blockInteractions(false);
  }
}

async function captureFullPage(): Promise<void> {
  await applyZoom(currentRequest?.scale ?? 1);

  const dims: PageDimensions = getPageDimensions();
  totalWidth = dims.fullWidth;
  totalHeight = dims.fullHeight;
  scrollTiles = computeScrollGrid(
    dims,
    currentSettings?.scrollPad ?? CAPTURE.SCROLL_PAD,
  );
  captureOffset = { x: 0, y: 0 };

  hideScrollbars();
  blockInteractions(true);

  try {
    await processNextTile();
  } finally {
    resetZoom();
    blockInteractions(false);
  }
}

async function captureSelection(): Promise<void> {
  let sel: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null = await waitForSelection();
  if (sel == null) {
    browser.runtime
      .sendMessage({ type: 'captureCancelled' })
      .catch((): void => {});
    return;
  }

  const scale = currentRequest?.scale ?? 1;
  const isZoom = currentSettings?.zoomCapture === true && scale > 1;

  if (isZoom) {
    sel = {
      x: sel.x * scale,
      y: sel.y * scale,
      width: sel.width * scale,
      height: sel.height * scale,
    };
  }

  await applyZoom(scale);

  totalWidth = sel.width;
  totalHeight = sel.height;
  captureOffset = { x: sel.x, y: sel.y };

  hideScrollbars();
  blockInteractions(true);

  try {
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    if (sel.width <= viewportW && sel.height <= viewportH) {
      const result = await requestCapture({
        x: sel.x,
        y: sel.y,
        width: sel.width,
        height: sel.height,
      });
      capturedImages.push({
        x: 0,
        y: 0,
        width: sel.width,
        height: sel.height,
        dataUri: result.dataUri,
      });
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
    scrollTiles = computeScrollGrid(
      clippedDims,
      currentSettings?.scrollPad ?? CAPTURE.SCROLL_PAD,
    ).map((t: CaptureTile): CaptureTile => ({
      x: t.x + sel.x,
      y: t.y + sel.y,
      width: t.width,
      height: t.height,
    }));
    await processNextTile();
  } finally {
    resetZoom();
    blockInteractions(false);
  }
}

function requestCapture(
  tile: CaptureTile,
): Promise<{ dataUri: string; x: number; y: number }> {
  return new Promise<{ dataUri: string; x: number; y: number }>(
    (
      resolve: (result: { dataUri: string; x: number; y: number }) => void,
      reject: (err: Error) => void,
    ): void => {
      const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
        reject(new Error('Capture timeout'));
      }, CAPTURE.EXECUTE_TIMEOUT);

      window.scrollTo(tile.x, tile.y);
      const x = window.scrollX;
      const y = window.scrollY;

      const captureDelay = Math.max(
        0,
        currentSettings?.captureDelay ?? CAPTURE.CAPTURE_DELAY,
      );

      setTimeout((): void => {
        browser.runtime
          .sendMessage({ type: 'requestCapture', data: { x, y } })
          .then((response: unknown): void => {
            clearTimeout(timeoutId);
            const resp: { dataUri?: string; error?: string } | undefined =
              response as { dataUri?: string; error?: string } | undefined;
            if (resp?.dataUri != null) {
              resolve({ dataUri: resp.dataUri, x, y });
            } else {
              const errorMsg: string = resp?.error ?? 'Capture failed';
              reject(new Error(errorMsg));
            }
          })
          .catch((err: unknown): void => {
            clearTimeout(timeoutId);
            reject(err instanceof Error ? err : new Error(String(err)));
          });
      }, captureDelay);
    },
  );
}

async function processNextTile(): Promise<void> {
  if (scrollTiles.length === 0) {
    browser.runtime
      .sendMessage({
        type: 'captureError',
        data: { message: 'Nothing to capture' },
      })
      .catch((): void => {});
    cleanup();
    return;
  }

  if (currentTileIndex >= scrollTiles.length) {
    await finalizeCapture();
    return;
  }

  const tile: CaptureTile = scrollTiles[currentTileIndex];
  try {
    const result = await requestCapture(tile);
    capturedImages.push({
      x: result.x - captureOffset.x,
      y: result.y - captureOffset.y,
      width: tile.width,
      height: tile.height,
      dataUri: result.dataUri,
    });

    browser.runtime
      .sendMessage({
        type: 'captureProgress',
        data: { complete: (currentTileIndex + 1) / scrollTiles.length },
      })
      .catch((): void => {});

    currentTileIndex++;
    await processNextTile();
  } catch {
    cleanup();
    browser.runtime
      .sendMessage({
        type: 'captureError',
        data: { message: 'Capture failed' },
      })
      .catch((): void => {});
  }
}

async function finalizeCapture(): Promise<void> {
  if (currentRequest == null || capturedImages.length === 0) {
    browser.runtime
      .sendMessage({
        type: 'captureError',
        data: { message: 'No capture data' },
      })
      .catch((): void => {});
    cleanup();
    return;
  }

  try {
    const dataUri: string = await exportCaptureAsDataUri();
    const filename: string = getFilename(
      window.location.href,
      currentRequest.format,
    );

    const a: HTMLAnchorElement = document.createElement('a');
    a.href = dataUri;
    a.download = filename;
    a.click();

    browser.runtime.sendMessage({ type: 'captureBlob' }).catch((): void => {});
  } catch {
    browser.runtime
      .sendMessage({ type: 'captureError', data: { message: 'Export failed' } })
      .catch((): void => {});
  } finally {
    cleanup();
  }
}

async function exportCaptureAsDataUri(): Promise<string> {
  const r: CaptureRequest = currentRequest as CaptureRequest;
  const scale = r.scale;
  const isZoom = currentSettings?.zoomCapture === true && scale > 1;
  const activeScale = isZoom ? 1 : scale;

  const blob: Blob = await compositeAndExport(
    capturedImages,
    totalWidth,
    totalHeight,
    r.format,
    activeScale,
    r.quality,
  );
  return blobToDataUri(blob);
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
        if (isSelecting && mode === 'drag') {
          const x: number = Math.min(e.clientX, startX - window.scrollX);
          const y: number = Math.min(e.clientY, startY - window.scrollY);
          const w: number = Math.abs(e.clientX - (startX - window.scrollX));
          const h: number = Math.abs(e.clientY - (startY - window.scrollY));
          selectionBox.style.left = `${x}px`;
          selectionBox.style.top = `${y}px`;
          selectionBox.style.width = `${w}px`;
          selectionBox.style.height = `${h}px`;
          selectionBox.style.display = 'block';
        } else if (!isSelecting) {
          const el: Element | null = getElementAtPoint(e.clientX, e.clientY);
          if (
            el != null &&
            el !== document.body &&
            el !== document.documentElement
          ) {
            const rect: DOMRect = el.getBoundingClientRect();
            selectionBox.style.left = `${rect.left}px`;
            selectionBox.style.top = `${rect.top}px`;
            selectionBox.style.width = `${rect.width}px`;
            selectionBox.style.height = `${rect.height}px`;
            selectionBox.style.display = 'block';
          } else {
            selectionBox.style.display = 'none';
          }
        }
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

  if (originalOverflow !== '') {
    document.documentElement.style.overflow = originalOverflow;
  }
  if (originalBodyOverflowY !== '') {
    document.body.style.overflowY = originalBodyOverflowY;
  }
  window.scrollTo(originalX, originalY);

  blockInteractions(false);
}
