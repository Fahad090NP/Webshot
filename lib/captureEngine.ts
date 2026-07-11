// Core capture engine: compositing, canvas processing, and blob generation

import { CAPTURE, FORMAT_EXTENSIONS } from './captureConfig';
import type {
  OutputFormat,
  CaptureTile,
  PageDimensions,
  CapturedImage,
} from './types';

export interface CanvasTile {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function computeScrollGrid(
  dims: PageDimensions,
  scrollPad: number,
): CaptureTile[] {
  const { fullWidth, fullHeight, viewportWidth, viewportHeight } = dims;
  const yDelta = viewportHeight - Math.min(viewportHeight, scrollPad);
  const tiles: CaptureTile[] = [];
  const maxScrollY = Math.max(0, fullHeight - viewportHeight);

  let yPos = 0;
  while (yPos <= maxScrollY) {
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
    if (yPos === maxScrollY) {
      break;
    }
    yPos = Math.min(yPos + yDelta, maxScrollY);
  }

  return tiles;
}

export function initCompositeCanvases(
  totalWidth: number,
  totalHeight: number,
): CanvasTile[] {
  const badSize: boolean =
    totalHeight > CAPTURE.MAX_PRIMARY_DIMENSION ||
    totalWidth > CAPTURE.MAX_PRIMARY_DIMENSION ||
    totalHeight * totalWidth > CAPTURE.MAX_AREA;
  const biggerWidth: boolean = totalWidth > totalHeight;
  const maxWidth: number = !badSize
    ? totalWidth
    : biggerWidth
      ? CAPTURE.MAX_PRIMARY_DIMENSION
      : CAPTURE.MAX_SECONDARY_DIMENSION;
  const maxHeight: number = !badSize
    ? totalHeight
    : biggerWidth
      ? CAPTURE.MAX_SECONDARY_DIMENSION
      : CAPTURE.MAX_PRIMARY_DIMENSION;
  const numCols: number = Math.ceil(totalWidth / maxWidth);
  const numRows: number = Math.ceil(totalHeight / maxHeight);
  const result: CanvasTile[] = [];

  for (let row: number = 0; row < numRows; row++) {
    for (let col: number = 0; col < numCols; col++) {
      const canvas: HTMLCanvasElement = document.createElement('canvas');
      canvas.width =
        col === numCols - 1 ? totalWidth % maxWidth || maxWidth : maxWidth;
      canvas.height =
        row === numRows - 1 ? totalHeight % maxHeight || maxHeight : maxHeight;
      const left: number = col * maxWidth;
      const top: number = row * maxHeight;

      const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');
      if (ctx == null) continue;

      result.push({
        canvas,
        ctx,
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
  const imgRight: number = imgLeft + imgWidth;
  const imgBottom: number = imgTop + imgHeight;
  return tiles.filter(
    (t: CanvasTile): boolean =>
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
  const mimeType: string | null =
    format === 'png'
      ? 'image/png'
      : format === 'jpeg'
        ? 'image/jpeg'
        : format === 'webp'
          ? 'image/webp'
          : null;

  if (mimeType == null) {
    return Promise.reject(
      new Error(`Format ${format} unsupported by canvas export`),
    );
  }

  return new Promise<Blob>(
    (resolve: (blob: Blob) => void, reject: (err: Error) => void): void => {
      canvas.toBlob(
        (blob: Blob | null): void => {
          if (blob != null) {
            resolve(blob);
          } else {
            reject(new Error(`Failed to create ${format} blob`));
          }
        },
        mimeType,
        quality,
      );
    },
  );
}

export function dataUriToBlob(dataUri: string): Blob {
  const parts: string[] = dataUri.split(',');
  const mimeMatch: RegExpMatchArray | null = (parts[0] ?? '').match(/:(.*?);/);
  const mimeString: string = mimeMatch?.[1] ?? 'image/png';
  const byteString: string = atob(parts[1] ?? '');
  const ab: ArrayBuffer = new ArrayBuffer(byteString.length);
  const ia: Uint8Array = new Uint8Array(ab);
  for (let i: number = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
}

export function getFilename(url: string, format: OutputFormat): string {
  const ext: string = FORMAT_EXTENSIONS[format] ?? 'png';
  const path: string = url.split('?')[0]?.split('#')[0] ?? '';
  const name: string = path
    .replace(/^https?:\/\//, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^_+-/, '')
    .replace(/_+-$/, '');
  return `webshot-${name || 'page'}-${Date.now()}.${ext}`;
}

export async function renderToCanvas(
  imageDataList: CapturedImage[],
  totalWidth: number,
  totalHeight: number,
  scale: number,
): Promise<HTMLCanvasElement> {
  const scaledW: number = Math.round(totalWidth * scale);
  const scaledH: number = Math.round(totalHeight * scale);
  const tiles: CanvasTile[] = initCompositeCanvases(scaledW, scaledH);

  for (const img of imageDataList) {
    await drawImageOnTiles(img, scale, tiles);
  }

  if (tiles.length === 1) {
    return tiles[0].canvas;
  }

  const finalCanvas: HTMLCanvasElement = document.createElement('canvas');
  finalCanvas.width = scaledW;
  finalCanvas.height = scaledH;
  const finalCtx: CanvasRenderingContext2D | null =
    finalCanvas.getContext('2d');
  if (finalCtx == null) {
    throw new Error('Failed to get canvas context');
  }
  for (const tile of tiles) {
    finalCtx.drawImage(tile.canvas, tile.left, tile.top);
  }
  return finalCanvas;
}

export async function compositeAndExport(
  imageDataList: CapturedImage[],
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
  const canvas: HTMLCanvasElement = await renderToCanvas(
    imageDataList,
    totalWidth,
    totalHeight,
    scale,
  );
  return canvasToBlob(canvas, format, quality);
}

async function exportAsSvg(
  imageDataList: CapturedImage[],
  totalWidth: number,
  totalHeight: number,
  scale: number,
): Promise<Blob> {
  const scaledW: number = Math.round(totalWidth * scale);
  const scaledH: number = Math.round(totalHeight * scale);
  const pngBlob: Blob = await compositeAndExport(
    imageDataList,
    totalWidth,
    totalHeight,
    'png',
    scale,
  );
  const pngDataUri: string = await blobToDataUri(pngBlob);
  const svgContent: string = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${scaledW}" height="${scaledH}" viewBox="0 0 ${scaledW} ${scaledH}">
  <image href="${pngDataUri}" width="${scaledW}" height="${scaledH}"/>
</svg>`;
  return new Blob([svgContent], { type: 'image/svg+xml' });
}

async function exportAsPdf(
  imageDataList: CapturedImage[],
  totalWidth: number,
  totalHeight: number,
  scale: number,
): Promise<Blob> {
  const scaledW: number = Math.round(totalWidth * scale);
  const scaledH: number = Math.round(totalHeight * scale);

  const { jsPDF: JsPdfClass } = await import('jspdf');
  const doc: InstanceType<typeof JsPdfClass> = new JsPdfClass({
    orientation: scaledW > scaledH ? 'landscape' : 'portrait',
    unit: 'px',
    format: [scaledW, scaledH] as [number, number],
  });
  const canvas: HTMLCanvasElement = await renderToCanvas(
    imageDataList,
    totalWidth,
    totalHeight,
    scale,
  );
  const dataUri: string = canvas.toDataURL('image/png');
  doc.addImage(dataUri, 'PNG', 0, 0, scaledW, scaledH);
  const pdfOutput: ArrayBuffer = doc.output('arraybuffer');
  return new Blob([pdfOutput], { type: 'application/pdf' });
}

export function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise<string>(
    (resolve: (result: string) => void, reject: (err: Error) => void): void => {
      const reader: FileReader = new FileReader();
      reader.onload = (): void => {
        resolve(reader.result as string);
      };
      reader.onerror = (): void => {
        reject(new Error('Failed to read blob'));
      };
      reader.readAsDataURL(blob);
    },
  );
}

function drawImageOnTiles(
  img: CapturedImage,
  scale: number,
  tiles: CanvasTile[],
): Promise<void> {
  return new Promise<void>(
    (resolve: () => void, reject: (err: Error) => void): void => {
      const image: HTMLImageElement = new Image();
      image.onload = (): void => {
        const relevantTiles: CanvasTile[] = filterTiles(
          img.x * scale,
          img.y * scale,
          img.width * scale,
          img.height * scale,
          tiles,
        );
        for (const tile of relevantTiles) {
          tile.ctx.drawImage(
            image,
            img.x * scale - tile.left,
            img.y * scale - tile.top,
            img.width * scale,
            img.height * scale,
          );
        }
        resolve();
      };
      image.onerror = (): void => {
        reject(new Error('Failed to load image'));
      };
      image.src = img.dataUri;
    },
  );
}
