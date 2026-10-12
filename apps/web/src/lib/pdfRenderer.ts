import * as pdfjsLib from 'pdfjs-dist';
import type { DocumentPagePreview } from './documentPreview';

// Configure the PDF.js worker — use local Vite-bundled worker only.
// Never use CDN workers as they hang on phones on local WiFi with no internet.
if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.js',
      import.meta.url
    ).toString();
  } catch {
    // Last-resort inline worker mode — avoids CDN entirely
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  }
}

/**
 * Extracts and renders real preview images for each page of an uploaded PDF.
 * Designed to work offline / on LAN without any CDN dependencies.
 */
export async function renderPdfPages(
  fileOrBuffer: File | ArrayBuffer,
  maxPages: number = 50,
  onProgress?: (current: number, total: number) => void
): Promise<DocumentPagePreview[]> {
  const LOAD_TIMEOUT_MS = 20000  // 20s max for PDF load
  const PAGE_TIMEOUT_MS = 8000   // 8s max per page render

  try {
    const data = fileOrBuffer instanceof File ? await fileOrBuffer.arrayBuffer() : fileOrBuffer;

    // Load PDF without CDN cMap dependency — works fully offline/on LAN.
    // Standard PDFs (Latin chars) render perfectly without cMaps.
    // Non-Latin fonts may show placeholders, which is acceptable for preview.
    const loadingTask = pdfjsLib.getDocument({
      data,
      // No cMapUrl — avoids CDN fetch that hangs on phones without internet
      cMapPacked: true,
      verbosity: 0,
    });

    const pdf = await Promise.race([
      loadingTask.promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('PDF load timeout — file may be corrupt or too large')), LOAD_TIMEOUT_MS)
      ),
    ]);

    const numPages = pdf.numPages;
    const pagesToRender = Math.min(numPages, maxPages);
    const pages: DocumentPagePreview[] = [];

    for (let i = 1; i <= pagesToRender; i++) {
      try {
        const page = await Promise.race([
          pdf.getPage(i),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Page ${i} load timeout`)), PAGE_TIMEOUT_MS)
          ),
        ]);

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

          await Promise.race([
            page.render({ canvasContext: ctx, viewport }).promise,
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Page ${i} render timeout`)), PAGE_TIMEOUT_MS)
            ),
          ]);

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
      } catch (pageErr) {
        console.warn(`[pdfRenderer] Skipping page ${i}:`, pageErr)
        // Push a blank placeholder so page count stays correct
        pages.push({
          id: i,
          pageNumber: i,
          title: `Page ${i}`,
          subtitle: `Page ${i} of ${numPages}`,
          url: '',
          width: 720,
          height: 1020,
        })
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
    console.error('[pdfRenderer] Error rendering PDF pages:', err);
    throw err;
  }
}
