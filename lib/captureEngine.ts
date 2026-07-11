// Core capture engine: compositing, canvas processing, and blob generation

import { CAPTURE, FORMAT_EXTENSIONS } from './captureConfig';
import type { OutputFormat, CaptureTile, PageDimensions } from './types';

export interface CanvasTile {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function computeScrollGrid(dims: PageDimensions): CaptureTile[] {
  const { fullWidth, fullHeight, viewportWidth, viewportHeight } = dims;
  const yDelta = viewportHeight - Math.min(viewportHeight, CAPTURE.SCROLL_PAD);
  const tiles: CaptureTile[] = [];

  let yPos = fullHeight - viewportHeight;
  while (yPos > -yDelta) {
    let xPos = 0;
    while (xPos < fullWidth) {
      tiles.push({
        x: xPos,
        y: yPos,
        width: viewportWidth,
        height: viewportHeight,
      });
      xPos += viewportWidth;
    }
    yPos -= yDelta;
  }

  return tiles;
}

export function initCompositeCanvases(
  totalWidth: number,
  totalHeight: number,
): CanvasTile[] {
  const badSize =
    totalHeight > CAPTURE.MAX_PRIMARY_DIMENSION ||
    totalWidth > CAPTURE.MAX_PRIMARY_DIMENSION ||
    totalHeight * totalWidth > CAPTURE.MAX_AREA;
  const biggerWidth = totalWidth > totalHeight;
  const maxWidth = !badSize
    ? totalWidth
    : biggerWidth
      ? CAPTURE.MAX_PRIMARY_DIMENSION
      : CAPTURE.MAX_SECONDARY_DIMENSION;
  const maxHeight = !badSize
    ? totalHeight
    : biggerWidth
      ? CAPTURE.MAX_SECONDARY_DIMENSION
      : CAPTURE.MAX_PRIMARY_DIMENSION;
  const numCols = Math.ceil(totalWidth / maxWidth);
  const numRows = Math.ceil(totalHeight / maxHeight);
  const result: CanvasTile[] = [];

  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      const canvas = document.createElement('canvas');
      canvas.width =
        col === numCols - 1 ? totalWidth % maxWidth || maxWidth : maxWidth;
      canvas.height =
        row === numRows - 1 ? totalHeight % maxHeight || maxHeight : maxHeight;
      const left = col * maxWidth;
      const top = row * maxHeight;

      result.push({
        canvas,
        ctx: canvas.getContext('2d') as CanvasRenderingContext2D,
        left,
        top,
        right: left + canvas.width,
        bottom: top + canvas.height,
      });
    }
  }

  return result;
}

export function filterTiles(
  imgLeft: number,
  imgTop: number,
  imgWidth: number,
  imgHeight: number,
  tiles: CanvasTile[],
): CanvasTile[] {
  const imgRight = imgLeft + imgWidth;
  const imgBottom = imgTop + imgHeight;
  return tiles.filter(
    (t) =>
      imgLeft < t.right &&
      imgRight > t.left &&
      imgTop < t.bottom &&
      imgBottom > t.top,
  );
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: OutputFormat,
  quality?: number,
): Promise<Blob> {
  const mimeType =
    format === 'png'
      ? 'image/png'
      : format === 'jpeg'
        ? 'image/jpeg'
        : format === 'webp'
          ? 'image/webp'
          : null;

  if (!mimeType)
    return Promise.reject(
      new Error(`Format ${format} unsupported by canvas export`),
    );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`Failed to create ${format} blob`));
      },
      mimeType,
      quality,
    );
  });
}

export function dataUriToBlob(dataUri: string): Blob {
  const parts = dataUri.split(',');
  const mimeMatch = parts[0]?.match(/:(.*?);/);
  const mimeString = mimeMatch?.[1] ?? 'image/png';
  const byteString = atob(parts[1] ?? '');
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
}

export function getFilename(url: string, format: OutputFormat): string {
  const ext = FORMAT_EXTENSIONS[format] ?? 'png';
  const path = url.split('?')[0]?.split('#')[0] ?? '';
  const name = path
    .replace(/^https?:\/\//, '')
    .replace(/[^A-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^_+-/, '')
    .replace(/_+-$/, '');
  return `webshot-${name || 'page'}-${Date.now()}.${ext}`;
}

export async function renderToCanvas(
  imageDataList: Array<{ x: number; y: number; dataUri: string }>,
  totalWidth: number,
  totalHeight: number,
  scale: number,
): Promise<HTMLCanvasElement> {
  const scaledW = Math.round(totalWidth * scale);
  const scaledH = Math.round(totalHeight * scale);
  const tiles = initCompositeCanvases(scaledW, scaledH);

  for (const img of imageDataList) {
    await drawImageOnTiles(img, scale, tiles);
  }

  if (tiles.length === 1) return tiles[0]?.canvas as HTMLCanvasElement;

  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = scaledW;
  finalCanvas.height = scaledH;
  const finalCtx = finalCanvas.getContext('2d') as CanvasRenderingContext2D;
  for (const tile of tiles) {
    finalCtx.drawImage(tile.canvas, tile.left, tile.top);
  }
  return finalCanvas;
}

export async function compositeAndExport(
  imageDataList: Array<{ x: number; y: number; dataUri: string }>,
  totalWidth: number,
  totalHeight: number,
  format: OutputFormat,
  scale: number,
  quality?: number,
): Promise<Blob> {
  if (format === 'svg') {
    return exportAsSvg(imageDataList, totalWidth, totalHeight, scale);
  }
  if (format === 'pdf') {
    return exportAsPdf(imageDataList, totalWidth, totalHeight, scale);
  }
  const canvas = await renderToCanvas(
    imageDataList,
    totalWidth,
    totalHeight,
    scale,
  );
  return canvasToBlob(canvas, format, quality);
}

async function exportAsSvg(
  imageDataList: Array<{ x: number; y: number; dataUri: string }>,
  totalWidth: number,
  totalHeight: number,
  scale: number,
): Promise<Blob> {
  const scaledW = Math.round(totalWidth * scale);
  const scaledH = Math.round(totalHeight * scale);
  const pngBlob = await compositeAndExport(
    imageDataList,
    totalWidth,
    totalHeight,
    'png',
    scale,
  );
  const pngDataUri = await blobToDataUri(pngBlob);
  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${scaledW}" height="${scaledH}" viewBox="0 0 ${scaledW} ${scaledH}">
  <image href="${pngDataUri}" width="${scaledW}" height="${scaledH}"/>
</svg>`;
  return new Blob([svgContent], { type: 'image/svg+xml' });
}

async function exportAsPdf(
  imageDataList: Array<{ x: number; y: number; dataUri: string }>,
  totalWidth: number,
  totalHeight: number,
  scale: number,
): Promise<Blob> {
  const scaledW = Math.round(totalWidth * scale);
  const scaledH = Math.round(totalHeight * scale);

  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({
    orientation: scaledW > scaledH ? 'landscape' : 'portrait',
    unit: 'px',
    format: [scaledW, scaledH],
  });
  const canvas = await renderToCanvas(
    imageDataList,
    totalWidth,
    totalHeight,
    scale,
  );
  const dataUri = canvas.toDataURL('image/png');
  doc.addImage(dataUri, 'PNG', 0, 0, scaledW, scaledH);
  return new Blob([doc.output('arraybuffer')], { type: 'application/pdf' });
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

function drawImageOnTiles(
  img: { x: number; y: number; dataUri: string },
  scale: number,
  tiles: CanvasTile[],
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
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = img.dataUri;
  });
}
