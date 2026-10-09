import * as pdfjsLib from 'pdfjs-dist';
import type { DocumentPagePreview } from './documentPreview';

// Configure the PDF.js worker
if (typeof window !== 'undefined') {
  try {
    // Attempt local Vite-resolved worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.js',
      import.meta.url
    ).toString();
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
}

/**
 * Extracts and renders real preview images for each page of an uploaded PDF.
 */
export async function renderPdfPages(
  fileOrBuffer: File | ArrayBuffer,
  maxPages: number = 50,
  onProgress?: (current: number, total: number) => void
): Promise<DocumentPagePreview[]> {
  try {
    const data = fileOrBuffer instanceof File ? await fileOrBuffer.arrayBuffer() : fileOrBuffer;
    
    // Ensure worker is set
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const loadingTask = pdfjsLib.getDocument({
      data,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true,
    });

    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    const pagesToRender = Math.min(numPages, maxPages);
    const pages: DocumentPagePreview[] = [];

    for (let i = 1; i <= pagesToRender; i++) {
      const page = await pdf.getPage(i);
      
      // Fast, crisp preview rendering (~720px width)
      const baseViewport = page.getViewport({ scale: 1.0 });
      const targetWidth = 720;
      const scale = Math.min(2.0, Math.max(1.0, targetWidth / baseViewport.width));
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvasContext: ctx,
          viewport,
        }).promise;

        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        pages.push({
          id: i,
          pageNumber: i,
          title: `Page ${i}`,
          subtitle: `Page ${i} of ${numPages}`,
          url: dataUrl,
          width: Math.floor(viewport.width),
          height: Math.floor(viewport.height),
        });
      }

      if (onProgress) {
        onProgress(i, pagesToRender);
      }

      // Yield briefly between pages to keep UI responsive
      if (i % 3 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    return pages;
  } catch (err) {
    console.error('Error rendering real PDF pages:', err);
    throw err;
  }
}
