/**
 * PDF Engine Core
 * Handles PDF.js loading, worker initialization, and page rasterization.
 */
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.js?url';

// Configure worker URL for Vite asset pipeline
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export class PdfEngine {
  constructor() {
    this.pdfDoc = null;
    this.originalBytes = null;
  }

  /**
   * Load PDF document from ArrayBuffer, Uint8Array, or URL
   */
  async loadDocument(source, password = '', onPasswordNeeded = null) {
    // Clone ArrayBuffer / Uint8Array so PDF.js worker transfer does NOT detach original buffer
    let dataForPdfJs;
    if (source instanceof ArrayBuffer) {
      dataForPdfJs = new Uint8Array(source.slice(0));
      this.originalBytes = source.slice(0);
    } else if (source instanceof Uint8Array) {
      dataForPdfJs = new Uint8Array(source.buffer.slice(0));
      this.originalBytes = source.buffer.slice(0);
    }

    const loadingTask = pdfjsLib.getDocument({
      data: dataForPdfJs,
      url: typeof source === 'string' ? source : undefined,
      password,
      cMapUrl: './cmaps/',
      cMapPacked: true,
      standardFontDataUrl: './standard_fonts/',
    });

    if (typeof onPasswordNeeded === 'function') {
      loadingTask.onPassword = (updatePassword, reason) => {
        onPasswordNeeded(updatePassword, reason);
      };
    }

    this.pdfDoc = await loadingTask.promise;
    return this.pdfDoc;
  }

  get numPages() {
    return this.pdfDoc ? this.pdfDoc.numPages : 0;
  }

  async getPage(pageNum) {
    if (!this.pdfDoc) throw new Error('No PDF document loaded');
    return this.pdfDoc.getPage(pageNum);
  }

  /**
   * High-DPI rasterization to canvas (Layer 0) with cancellable task tracking
   */
  renderPageToCanvas(page, canvas, scale = 1.5, rotation = 0) {
    const dpr = Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2.5);
    const viewport = page.getViewport({ scale: scale * dpr, rotation });
    
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    canvas.style.width = `${Math.round(viewport.width / dpr)}px`;
    canvas.style.height = `${Math.round(viewport.height / dpr)}px`;

    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
    });

    renderTask.viewport = page.getViewport({ scale, rotation });
    renderTask.dpr = dpr;
    renderTask.rawViewport = viewport;

    renderTask.then = (onFulfilled, onRejected) => renderTask.promise.then(onFulfilled, onRejected);
    renderTask.catch = (onRejected) => renderTask.promise.catch(onRejected);

    return renderTask;
  }

  /**
   * Extract outline / Table of Contents
   */
  async getOutline() {
    if (!this.pdfDoc) return [];
    return (await this.pdfDoc.getOutline()) || [];
  }

  /**
   * Extract text content for digital search and hybrid stream
   */
  async getTextContent(page) {
    return page.getTextContent({
      normalizeWhitespace: true,
      disableCombineTextItems: false,
    });
  }

  /**
   * Render native PDF.js text layer into a container element
   */
  async renderTextLayerToContainer(page, container, viewport) {
    const textContent = await page.getTextContent({
      normalizeWhitespace: true,
      disableCombineTextItems: false,
    });

    container.innerHTML = '';
    const textLayerTask = pdfjsLib.renderTextLayer({
      textContentSource: textContent,
      container,
      viewport,
      textDivs: [],
    });

    await textLayerTask.promise;
    return textContent;
  }
}

export const pdfEngine = new PdfEngine();
