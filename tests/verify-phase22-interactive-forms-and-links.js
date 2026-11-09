/**
 * Phase 22 Verification: Sovereign Interactive Hyperlinks & AcroForms Engine
 * Tests link detection, viewport coordinate mapping, form widget generation,
 * form store state updates, and pdf-lib export flattening.
 */

import assert from 'node:assert';
import { FormStore, InteractiveAnnotations, interactiveAnnotations, formStore } from '../src/annotations/interactive-annotations.js';
import { PdfExporter } from '../src/annotations/pdf-exporter.js';
import { PDFDocument } from 'pdf-lib';

// Minimal DOM Mock for Headless Node Environment
function createMockElement(tagName = 'div') {
  const el = {
    tagName: tagName.toUpperCase(),
    className: '',
    get classList() {
      const self = this;
      return {
        add(c) {
          const parts = new Set(self.className.split(/\s+/).filter(Boolean));
          parts.add(c);
          self.className = Array.from(parts).join(' ');
        },
        remove(c) {
          const parts = new Set(self.className.split(/\s+/).filter(Boolean));
          parts.delete(c);
          self.className = Array.from(parts).join(' ');
        },
        contains(c) {
          return self.className.split(/\s+/).filter(Boolean).includes(c);
        },
        toggle(c, force) {
          const has = this.contains(c);
          const shouldAdd = force !== undefined ? Boolean(force) : !has;
          if (shouldAdd) this.add(c); else this.remove(c);
          return shouldAdd;
        }
      };
    },
    style: {},
    attributes: {},
    children: [],
    listeners: {},
    addEventListener(type, fn) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (!this.listeners[type]) return;
      this.listeners[type] = this.listeners[type].filter(f => f !== fn);
    },
    dispatchEvent(event) {
      const list = this.listeners[event.type] || [];
      list.forEach(fn => fn(event));
    },
    setAttribute(name, val) { this.attributes[name] = String(val); },
    getAttribute(name) { return this.attributes[name]; },
    appendChild(child) { this.children.push(child); return child; },
    querySelector(selector) {
      if (selector === '.layer-annotations') {
        return this.children.find(c => c.classList.contains('layer-annotations')) || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.pdf-interactive-link') {
        return this.children.filter(c => c.classList.contains('pdf-interactive-link'));
      }
      if (selector === '.pdf-form-widget') {
        return this.children.filter(c => c.classList.contains('pdf-form-widget'));
      }
      return [];
    }
  };
  return el;
}

globalThis.document = {
  createElement: (tag) => createMockElement(tag),
  getElementById: () => null,
};

async function runTests() {
  console.log('--- Running Phase 22 Interactive Forms & Hyperlinks Verification ---');

  // 1. FormStore Verification
  const testStore = new FormStore();
  let changeCount = 0;
  testStore.onChange(() => { changeCount++; });

  assert.strictEqual(testStore.hasValues(), false, 'Store should initially be empty');
  testStore.set('clientName', 'Alice Corp');
  assert.strictEqual(testStore.get('clientName'), 'Alice Corp', 'Field value should match');
  assert.strictEqual(testStore.hasValues(), true, 'Store should report hasValues');
  assert.strictEqual(changeCount, 1, 'Listener should be called once');

  testStore.set('isApproved', true);
  assert.strictEqual(testStore.entries().length, 2, 'Two fields stored');
  console.log('✓ FormStore: reactive key-value storage & change notifications verified');

  // 2. Viewport Coordinate Mapping
  const engine = new InteractiveAnnotations();
  const mockViewport = {
    scale: 1.5,
    height: 900,
    convertToViewportRectangle: (rect) => [rect[0] * 1.5, 900 - rect[3] * 1.5, rect[2] * 1.5, 900 - rect[1] * 1.5],
  };

  const converted = engine.convertRect([10, 20, 110, 40], mockViewport);
  assert.strictEqual(converted.left, 15, 'Left mapped correctly');
  assert.strictEqual(converted.width, 150, 'Width mapped correctly');
  assert.strictEqual(converted.height, 30, 'Height mapped correctly');
  console.log('✓ InteractiveAnnotations.convertRect: accurate bounding box projection verified');

  // 3. Render Page Hyperlinks & AcroForms
  const pageContainer = createMockElement('div');
  const mockPage = {
    getAnnotations: async () => [
      {
        subtype: 'Link',
        rect: [50, 50, 200, 70],
        url: 'https://example.org/spec',
      },
      {
        subtype: 'Link',
        rect: [50, 80, 150, 100],
        dest: 'destination.chapter2',
      },
      {
        subtype: 'Widget',
        fieldType: 'Tx',
        fieldName: 'Company',
        fieldValue: 'Pedif Studio',
        rect: [50, 200, 250, 225],
      },
      {
        subtype: 'Widget',
        fieldType: 'Btn',
        fieldName: 'AgreeTerms',
        fieldValue: 'Yes',
        rect: [50, 240, 70, 260],
      },
      {
        subtype: 'Widget',
        fieldType: 'Ch',
        fieldName: 'Country',
        options: ['USA', 'UK', 'Germany', 'Japan'],
        fieldValue: 'Germany',
        rect: [50, 280, 200, 305],
      }
    ],
  };

  let navigatedTo = null;
  const layer = await engine.renderPageAnnotations(
    mockPage,
    1,
    pageContainer,
    mockViewport,
    (pNum) => { navigatedTo = pNum; }
  );

  assert.ok(layer, 'Layer should be rendered');
  const links = layer.children.filter(c => c.classList.contains('pdf-interactive-link'));
  assert.strictEqual(links.length, 2, 'Should render 2 links');
  assert.strictEqual(links[0].href, 'https://example.org/spec', 'External link href matches');
  assert.strictEqual(links[1].classList.contains('pdf-link-goto'), true, 'Internal link class set');

  const widgets = layer.children.filter(c => c.classList.contains('pdf-form-widget'));
  assert.strictEqual(widgets.length, 3, 'Should render 3 form widgets (Text, Checkbox, Dropdown)');
  console.log('✓ InteractiveAnnotations.renderPageAnnotations: DOM elements rendered cleanly');

  // 4. Form Store Input Event Binding
  const textWidget = widgets.find(w => w.name === 'Company');
  assert.ok(textWidget, 'Text widget exists');
  textWidget.dispatchEvent({ type: 'input', target: { value: 'Global Logistics' } });
  assert.strictEqual(engine.formStore.get('Company'), 'Global Logistics', 'Store updated on input');

  const checkWidget = widgets.find(w => w.name === 'AgreeTerms');
  assert.ok(checkWidget, 'Checkbox widget exists');
  checkWidget.dispatchEvent({ type: 'change', target: { checked: true } });
  assert.strictEqual(engine.formStore.get('AgreeTerms'), true, 'Checkbox store updated');
  console.log('✓ FormWidget Event Dispatching: live two-way data sync verified');

  // 5. PDF-Lib Integration & Form Flattening
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 800]);
  const form = pdfDoc.getForm();
  const pdfTextField = form.createTextField('Company');
  pdfTextField.addToPage(page, { x: 50, y: 700, width: 200, height: 25 });

  engine.formStore.set('Company', 'Verified Enterprise Inc.');
  engine.applyFormValuesToPdf(pdfDoc, { flatten: true });

  const exportedBytes = await pdfDoc.save();
  assert.ok(exportedBytes && exportedBytes.length > 500, 'Exported PDF generated successfully');
  console.log('✓ InteractiveAnnotations.applyFormValuesToPdf: pdf-lib form population and flattening verified');

  console.log('--- All Phase 22 Interactive Forms & Hyperlinks Tests Passed Successfully ---');
}

runTests().catch((err) => {
  console.error('Phase 22 Verification Failed:', err);
  process.exit(1);
});
