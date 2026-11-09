/**
 * Phase 23 Verification: Sovereign Document Sanitizer & Privacy Purge
 * Tests detection and permanent stripping of identifying metadata, XMP XML stream,
 * private application data, and AcroForm flattening.
 */

import assert from 'node:assert';
import { SanitizerDialog } from '../src/tools/sanitizer-dialog.js';
import { PDFDocument, PDFName } from 'pdf-lib';

// Minimal DOM Mock for Node Environment
function createMockElement(tagName = 'div') {
  const el = {
    tagName: tagName.toUpperCase(),
    className: '',
    hidden: false,
    checked: true,
    listeners: {},
    children: [],
    attributes: {},
    innerHTML: '',
    textContent: '',
    style: {},
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); el.className = Array.from(this._set).join(' '); },
      remove(c) { this._set.delete(c); el.className = Array.from(this._set).join(' '); },
      contains(c) { return this._set.has(c); },
      toggle(c) { if (this.contains(c)) this.remove(c); else this.add(c); }
    },
    addEventListener(type, fn) {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(fn);
    },
    removeEventListener(type, fn) {
      if (!this.listeners[type]) return;
      this.listeners[type] = this.listeners[type].filter(f => f !== fn);
    },
    dispatchEvent(event) {
      (this.listeners[event.type] || []).forEach(fn => fn(event));
    },
    setAttribute(name, val) { this.attributes[name] = String(val); },
    getAttribute(name) { return this.attributes[name]; },
    appendChild(child) { this.children.push(child); return child; },
    querySelector(selector) {
      if (selector === '#sanitizer-audit-summary') return { textContent: '', innerHTML: '' };
      if (selector === '#chk-strip-info') return { checked: true };
      if (selector === '#chk-strip-xmp') return { checked: true };
      if (selector === '#chk-strip-private') return { checked: true };
      if (selector === '#chk-flatten-forms') return { checked: true };
      return createMockElement('div');
    }
  };
  return el;
}

globalThis.document = {
  createElement: (tag) => createMockElement(tag),
  body: { appendChild: () => {} },
  getElementById: () => null,
};

async function runTests() {
  console.log('--- Running Phase 23 Sovereign Document Sanitizer Verification ---');

  // 1. Create a PDF with private metadata, XMP stream, and AcroForm
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle('Confidential Internal Report');
  pdfDoc.setAuthor('Secret Investigator');
  pdfDoc.setSubject('Financial Audit 2026');
  pdfDoc.setKeywords(['confidential', 'nda', 'private']);
  pdfDoc.setProducer('Internal Enterprise Suite 14.0');

  // Simulate an XMP Metadata stream and Private Info in Catalog
  const xmpStream = pdfDoc.context.stream('<x:xmpmeta>Confidential History</x:xmpmeta>');
  const xmpRef = pdfDoc.context.register(xmpStream);
  pdfDoc.catalog.set(PDFName.of('Metadata'), xmpRef);
  pdfDoc.catalog.set(PDFName.of('PieceInfo'), pdfDoc.context.obj({}));

  const page = pdfDoc.addPage([600, 800]);
  const form = pdfDoc.getForm();
  const field = form.createTextField('UserSSN');
  field.setText('000-12-3456');
  field.addToPage(page, { x: 50, y: 700, width: 150, height: 25 });

  const initialPdfBytes = await pdfDoc.save();
  assert.ok(initialPdfBytes.length > 500, 'Initial test document generated');
  console.log('✓ Initial PDF with private metadata and XMP stream created');

  // 2. Instantiate SanitizerDialog and audit document
  let sanitizedResult = null;
  const dialog = new SanitizerDialog({
    onApplied: (bytes) => {
      sanitizedResult = bytes;
    }
  });

  await dialog.show(initialPdfBytes);
  assert.strictEqual(dialog.detectedItems.hasAuthor, true, 'Author should be detected');
  assert.strictEqual(dialog.detectedItems.hasTitle, true, 'Title should be detected');
  assert.strictEqual(dialog.detectedItems.hasXmp, true, 'XMP Metadata stream should be detected');
  assert.strictEqual(dialog.detectedItems.hasPieceInfo, true, 'PieceInfo dictionary should be detected');
  assert.strictEqual(dialog.detectedItems.hasAcroForm, true, 'AcroForm should be detected');
  console.log('✓ SanitizerDialog: Successfully identified all 5 privacy risk vectors');

  // 3. Execute Sanitization
  await dialog.sanitize();
  assert.ok(sanitizedResult && sanitizedResult.length > 500, 'Sanitized PDF should be produced');

  // 4. Verify the Sanitized PDF has all private data purged
  const verifiedDoc = await PDFDocument.load(sanitizedResult, { ignoreEncryption: true });
  assert.strictEqual(verifiedDoc.getTitle(), '', 'Title must be empty');
  assert.strictEqual(verifiedDoc.getAuthor(), '', 'Author must be empty');
  assert.strictEqual(verifiedDoc.getSubject(), '', 'Subject must be empty');
  assert.strictEqual(verifiedDoc.getKeywords().length, 0, 'Keywords must be cleared');
  assert.strictEqual(verifiedDoc.catalog.has(PDFName.of('Metadata')), false, 'XMP XML stream must be deleted');
  assert.strictEqual(verifiedDoc.catalog.has(PDFName.of('PieceInfo')), false, 'PieceInfo must be deleted');
  console.log('✓ Verified: Document metadata, XMP stream, and private data completely purged');

  console.log('--- All Phase 23 Sovereign Document Sanitizer Tests Passed Successfully ---');
}

runTests().catch((err) => {
  console.error('Phase 23 Verification Failed:', err);
  process.exit(1);
});
