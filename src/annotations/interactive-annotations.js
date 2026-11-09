/**
 * Sovereign Interactive PDF Annotations & AcroForms Engine
 * Supports:
 * 1. Hyperlink navigation (External web URLs & internal document destinations)
 * 2. In-place AcroForms interactive input (Text fields, checkboxes, dropdowns)
 * 3. Form value preservation and ISO 32000-1 pdf-lib export flattening
 */

import { pdfEngine } from '../core/pdf-engine.js';

export class FormStore {
  constructor() {
    this.values = new Map(); // fieldName -> value
    this.listeners = new Set();
  }

  get(fieldName) {
    return this.values.get(fieldName);
  }

  set(fieldName, val) {
    this.values.set(fieldName, val);
    this.notify();
  }

  hasValues() {
    return this.values.size > 0;
  }

  clear() {
    this.values.clear();
    this.notify();
  }

  entries() {
    return Array.from(this.values.entries());
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    this.listeners.forEach((fn) => {
      try {
        fn(this.values);
      } catch (err) {
        console.error('[FormStore] Listener error:', err);
      }
    });
  }
}

export const formStore = new FormStore();

export class InteractiveAnnotations {
  constructor() {
    this.formStore = formStore;
  }

  /**
   * Safely convert PDF annotation rect to Viewport rect
   */
  convertRect(rect, viewport) {
    if (!rect || !Array.isArray(rect) || rect.length < 4) {
      return { left: 0, top: 0, width: 0, height: 0 };
    }

    if (viewport && typeof viewport.convertToViewportRectangle === 'function') {
      const vRect = viewport.convertToViewportRectangle(rect);
      const left = Math.min(vRect[0], vRect[2]);
      const top = Math.min(vRect[1], vRect[3]);
      const width = Math.abs(vRect[2] - vRect[0]);
      const height = Math.abs(vRect[3] - vRect[1]);
      return { left, top, width, height };
    }

    // Fallback coordinate mapping
    const scale = (viewport && viewport.scale) || 1;
    const vpHeight = (viewport && viewport.height) || 800;
    const x1 = rect[0] * scale;
    const y1 = vpHeight - rect[3] * scale;
    const x2 = rect[2] * scale;
    const y2 = vpHeight - rect[1] * scale;

    return {
      left: Math.min(x1, x2),
      top: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    };
  }

  /**
   * Resolve an internal document destination to a 1-based page number
   */
  async resolveDestinationPage(dest) {
    if (!dest || !pdfEngine || !pdfEngine.pdfDoc) return null;
    try {
      if (typeof dest === 'string') {
        const namedDest = await pdfEngine.pdfDoc.getDestination(dest);
        if (Array.isArray(namedDest) && namedDest[0]) {
          const idx = await pdfEngine.pdfDoc.getPageIndex(namedDest[0]);
          return idx + 1;
        }
      } else if (Array.isArray(dest) && dest[0]) {
        const idx = await pdfEngine.pdfDoc.getPageIndex(dest[0]);
        return idx + 1;
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * Render interactive links and form inputs for a page
   */
  async renderPageAnnotations(page, pageNum, pageContainer, viewport, onNavigate) {
    if (!page || !pageContainer) return null;

    let annotations = [];
    try {
      if (typeof page.getAnnotations === 'function') {
        annotations = (await page.getAnnotations({ intent: 'display' })) || [];
      }
    } catch (err) {
      console.warn(`[InteractiveAnnotations] Failed to load annotations for page ${pageNum}:`, err);
      return null;
    }

    if (!annotations.length) return null;

    let layer = pageContainer.querySelector('.layer-annotations');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'layer-annotations';
      pageContainer.appendChild(layer);
    }
    layer.innerHTML = '';

    for (const ann of annotations) {
      const { left, top, width, height } = this.convertRect(ann.rect, viewport);
      if (width <= 0 || height <= 0) continue;

      // ─────────────────────────────────────────────────────────────
      // 1. Hyperlinks (External URLs & Document GoTo Targets)
      // ─────────────────────────────────────────────────────────────
      if (ann.subtype === 'Link') {
        const linkEl = document.createElement('a');
        linkEl.className = 'pdf-interactive-link';
        linkEl.style.left = `${left}px`;
        linkEl.style.top = `${top}px`;
        linkEl.style.width = `${width}px`;
        linkEl.style.height = `${height}px`;

        if (ann.url) {
          linkEl.href = ann.url;
          linkEl.target = '_blank';
          linkEl.rel = 'noopener noreferrer';
          linkEl.title = ann.url;
          linkEl.setAttribute('aria-label', `External link: ${ann.url}`);
        } else if (ann.dest) {
          linkEl.classList.add('pdf-link-goto');
          linkEl.href = '#';
          linkEl.title = 'Jump to destination in document';
          linkEl.setAttribute('role', 'button');
          linkEl.setAttribute('aria-label', 'Jump to destination');

          linkEl.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const targetPage = await this.resolveDestinationPage(ann.dest);
            if (targetPage && typeof onNavigate === 'function') {
              onNavigate(targetPage);
            }
          });
        }

        layer.appendChild(linkEl);
      }

      // ─────────────────────────────────────────────────────────────
      // 2. AcroForms Interactive Widgets (Text, Checkbox, Select)
      // ─────────────────────────────────────────────────────────────
      else if (ann.subtype === 'Widget') {
        const fieldName = ann.fieldName || `field_${pageNum}_${Math.round(left)}_${Math.round(top)}`;
        const storedVal = this.formStore.get(fieldName);

        if (ann.fieldType === 'Tx') {
          // Text input or Multi-line textarea
          const isMulti = Boolean(ann.multiLine);
          const inputEl = document.createElement(isMulti ? 'textarea' : 'input');
          inputEl.className = 'pdf-form-widget pdf-form-text';
          if (!isMulti) inputEl.type = 'text';
          inputEl.style.left = `${left}px`;
          inputEl.style.top = `${top}px`;
          inputEl.style.width = `${width}px`;
          inputEl.style.height = `${height}px`;
          inputEl.name = fieldName;
          inputEl.value = storedVal !== undefined ? storedVal : (ann.fieldValue || '');
          if (ann.readOnly) inputEl.disabled = true;
          if (ann.maxLen) inputEl.maxLength = ann.maxLen;

          inputEl.addEventListener('input', (e) => {
            this.formStore.set(fieldName, e.target.value);
          });

          layer.appendChild(inputEl);
        } else if (ann.fieldType === 'Btn') {
          if (!ann.radioButton && !ann.pushButton) {
            // Checkbox
            const checkEl = document.createElement('input');
            checkEl.type = 'checkbox';
            checkEl.className = 'pdf-form-widget pdf-form-checkbox';
            checkEl.style.left = `${left}px`;
            checkEl.style.top = `${top}px`;
            checkEl.style.width = `${Math.max(16, width)}px`;
            checkEl.style.height = `${Math.max(16, height)}px`;
            checkEl.name = fieldName;

            const isChecked = storedVal !== undefined
              ? Boolean(storedVal)
              : (ann.fieldValue === 'Yes' || ann.fieldValue === true || ann.buttonValue === 'Yes');
            checkEl.checked = isChecked;
            if (ann.readOnly) checkEl.disabled = true;

            checkEl.addEventListener('change', (e) => {
              this.formStore.set(fieldName, e.target.checked);
            });

            layer.appendChild(checkEl);
          }
        } else if (ann.fieldType === 'Ch' && Array.isArray(ann.options)) {
          // Dropdown / Select
          const selectEl = document.createElement('select');
          selectEl.className = 'pdf-form-widget pdf-form-select';
          selectEl.style.left = `${left}px`;
          selectEl.style.top = `${top}px`;
          selectEl.style.width = `${width}px`;
          selectEl.style.height = `${height}px`;
          selectEl.name = fieldName;

          ann.options.forEach((opt) => {
            const optEl = document.createElement('option');
            const val = typeof opt === 'object' && opt !== null ? opt.exportValue : opt;
            const label = typeof opt === 'object' && opt !== null ? opt.displayValue : opt;
            optEl.value = val;
            optEl.textContent = label;
            selectEl.appendChild(optEl);
          });

          const currentVal = storedVal !== undefined ? storedVal : ann.fieldValue;
          if (currentVal) selectEl.value = currentVal;
          if (ann.readOnly) selectEl.disabled = true;

          selectEl.addEventListener('change', (e) => {
            this.formStore.set(fieldName, e.target.value);
          });

          layer.appendChild(selectEl);
        }
      }
    }

    return layer;
  }

  /**
   * Apply user-entered AcroForm values to a pdf-lib PDFDocument before export
   */
  applyFormValuesToPdf(pdfDoc, options = { flatten: false }) {
    if (!pdfDoc || typeof pdfDoc.getForm !== 'function') return;

    try {
      const form = pdfDoc.getForm();
      for (const [name, value] of this.formStore.entries()) {
        try {
          const field = form.getField(name);
          if (!field) continue;

          if (typeof field.setText === 'function') {
            field.setText(String(value));
          } else if (typeof field.check === 'function') {
            if (value) field.check();
            else if (typeof field.uncheck === 'function') field.uncheck();
          } else if (typeof field.select === 'function') {
            field.select(String(value));
          }
        } catch {
          // Skip fields that cannot be modified
        }
      }

      if (options.flatten && typeof form.flatten === 'function') {
        form.flatten();
      }
    } catch (err) {
      console.warn('[InteractiveAnnotations] Form value application error:', err);
    }
  }
}

export const interactiveAnnotations = new InteractiveAnnotations();
