import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface ExtractedPdfContent {
  pageCount: number;
  pagesText: string[];
  totalTextChars: number;
  scannedPageImages: Array<{ pageNumber: number; dataUrl: string; mimeType: string }>;
}

interface PositionedTextItem {
  str: string;
  x: number;
  y: number;
}

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_PDF_PAGES = 40;
const MAX_SCANNED_PAGES = 4;

export async function extractPdfContent(file: File): Promise<ExtractedPdfContent> {
  if (file.size > MAX_PDF_BYTES) {
    throw new Error('PDF file exceeds 25 MB limit. Please split or export a smaller statement range.');
  }

  const isPdfType =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdfType) {
    throw new Error('Please upload a valid .pdf file.');
  }

  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  const totalPages = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const pagesText: string[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    const items: PositionedTextItem[] = [];
    for (const rawItem of content.items) {
      if (!('str' in rawItem) || typeof rawItem.str !== 'string') continue;
      const text = rawItem.str.trim();
      if (!text) continue;
      const transform = Array.isArray(rawItem.transform) ? rawItem.transform : [1, 0, 0, 1, 0, 0];
      items.push({
        str: text,
        x: Number(transform[4]) || 0,
        y: Number(transform[5]) || 0,
      });
    }

    // Group items into visual rows by Y coordinate, sorted top-to-bottom then left-to-right
    items.sort((a, b) => {
      if (Math.abs(b.y - a.y) > 3.5) return b.y - a.y;
      return a.x - b.x;
    });

    const rows: PositionedTextItem[][] = [];
    for (const item of items) {
      const lastRow = rows[rows.length - 1];
      if (!lastRow || Math.abs(lastRow[0].y - item.y) > 3.5) {
        rows.push([item]);
      } else {
        lastRow.push(item);
      }
    }

    const lines = rows.map((row) => {
      row.sort((a, b) => a.x - b.x);
      let line = '';
      let prevX: number | null = null;
      for (const cell of row) {
        if (prevX !== null) {
          const gap = cell.x - prevX;
          line += gap > 14 ? ' | ' : ' ';
        }
        line += cell.str;
        prevX = cell.x + cell.str.length * 4;
      }
      return line.trim();
    });

    pagesText.push(`--- PAGE ${pageNum} ---\n${lines.filter(Boolean).join('\n')}`);
  }

  const joined = pagesText.join('\n').replace(/--- PAGE \d+ ---/g, '').trim();
  const totalTextChars = joined.length;

  // Fallback: if PDF appears scanned/image-only, render first pages to JPEG for vision extraction
  const scannedPageImages: Array<{ pageNumber: number; dataUrl: string; mimeType: string }> = [];
  if (totalTextChars < 80) {
    const pagesToRender = Math.min(totalPages, MAX_SCANNED_PAGES);
    for (let pageNum = 1; pageNum <= pagesToRender; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1 });
      const targetScale = Math.min(2, 1500 / Math.max(baseViewport.width || 1, baseViewport.height || 1));
      const viewport = page.getViewport({ scale: Math.max(1, targetScale) });

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvas,
        canvasContext: ctx,
        viewport,
      }).promise;

      scannedPageImages.push({
        pageNumber: pageNum,
        dataUrl: canvas.toDataURL('image/jpeg', 0.86),
        mimeType: 'image/jpeg',
      });
    }
  }

  return {
    pageCount: pdf.numPages,
    pagesText,
    totalTextChars,
    scannedPageImages,
  };
}

export function chunkPdfPages(pagesText: string[], maxChars = 11000): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const page of pagesText) {
    if (page.length > maxChars) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = '';
      }
      const lines = page.split('\n');
      let lineBuf = '';
      for (const line of lines) {
        if (lineBuf.length + line.length + 1 > maxChars && lineBuf.trim()) {
          chunks.push(lineBuf.trim());
          lineBuf = '';
        }
        lineBuf += (lineBuf ? '\n' : '') + line;
      }
      if (lineBuf.trim()) chunks.push(lineBuf.trim());
      continue;
    }

    if (current.length + page.length + 2 > maxChars && current.trim()) {
      chunks.push(current.trim());
      current = page;
    } else {
      current += (current ? '\n\n' : '') + page;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}
