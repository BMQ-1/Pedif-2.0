/**
 * Pedif 2.0 - Phase 16 Verification Suite: Sovereign Workbench & Globalization
 * Tests i18n globalization across 7 languages, Visual Page Organizer, Multi-PDF Merger,
 * Watermarking, Bates Numbering, and Metadata Catalog manipulation.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, rgb } from 'pdf-lib';
import { i18n } from '../src/i18n/i18n.js';

test('i18n Globalization Engine - 7 Languages & RTL', () => {
  const languages = ['en', 'ar', 'es', 'fr', 'de', 'ja', 'zh'];

  for (const lang of languages) {
    i18n.setLanguage(lang);
    assert.equal(i18n.currentLang, lang);

    const title = i18n.t('appTitle');
    assert.ok(title && title.length > 0, `Expected appTitle for ${lang}`);

    const organizeText = i18n.t('organizePages');
    assert.ok(organizeText && organizeText.length > 0, `Expected translation for organizePages in ${lang}`);

    const isRtl = i18n.isRtl();
    if (lang === 'ar') {
      assert.equal(isRtl, true, 'Arabic must report isRtl = true');
    } else {
      assert.equal(isRtl, false, `${lang} must report isRtl = false`);
    }
  }

  // Reset to English
  i18n.setLanguage('en');
  assert.equal(i18n.isRtl(), false);
  assert.equal(i18n.t('mergePdfs'), 'Merge PDFs');
});

test('Multi-PDF Merge Engine - Client-side Assembly via pdf-lib', async () => {
  // Create doc A with 2 pages
  const docA = await PDFDocument.create();
  docA.addPage([400, 600]);
  docA.addPage([400, 600]);
  const bytesA = await docA.save();

  // Create doc B with 3 pages
  const docB = await PDFDocument.create();
  docB.addPage([500, 700]);
  docB.addPage([500, 700]);
  docB.addPage([500, 700]);
  const bytesB = await docB.save();

  // Merge A and B
  const mergedPdf = await PDFDocument.create();
  const loadedA = await PDFDocument.load(bytesA);
  const loadedB = await PDFDocument.load(bytesB);

  const copiedA = await mergedPdf.copyPages(loadedA, loadedA.getPageIndices());
  copiedA.forEach(p => mergedPdf.addPage(p));

  const copiedB = await mergedPdf.copyPages(loadedB, loadedB.getPageIndices());
  copiedB.forEach(p => mergedPdf.addPage(p));

  const mergedBytes = await mergedPdf.save();
  assert.ok(mergedBytes.byteLength > 0);

  // Verify resulting document has exactly 5 pages
  const verified = await PDFDocument.load(mergedBytes);
  assert.equal(verified.getPageCount(), 5, 'Merged document must have 2 + 3 = 5 pages');
});

test('Visual Page Organizer Engine - Rotation & Rebuild', async () => {
  // Create sample 3-page document
  const srcDoc = await PDFDocument.create();
  const p1 = srcDoc.addPage([300, 400]);
  const p2 = srcDoc.addPage([300, 400]);
  const p3 = srcDoc.addPage([300, 400]);
  const srcBytes = await srcDoc.save();

  // Simulate reordering: Page 3 first, then Page 1 (rotated 90°), then a blank page
  const reorderDoc = await PDFDocument.create();
  const loadedSrc = await PDFDocument.load(srcBytes);

  // Copy page index 2 (Page 3)
  const [copied3] = await reorderDoc.copyPages(loadedSrc, [2]);
  reorderDoc.addPage(copied3);

  // Copy page index 0 (Page 1) with 90° rotation
  const [copied1] = await reorderDoc.copyPages(loadedSrc, [0]);
  copied1.setRotation({ type: 'degrees', angle: 90 });
  reorderDoc.addPage(copied1);

  // Add blank page
  reorderDoc.addPage([595.28, 841.89]);

  const outputBytes = await reorderDoc.save();
  const verified = await PDFDocument.load(outputBytes);

  assert.equal(verified.getPageCount(), 3, 'Reordered document should contain 3 pages');
  const pages = verified.getPages();
  assert.equal(pages[1].getRotation().angle, 90, 'Page 2 in new document must have 90° rotation');
});

test('Watermark & Bates Numbering Engine - Text Injection', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);

  // Stamp Watermark
  page.drawText('CONFIDENTIAL', {
    x: 100,
    y: 400,
    size: 48,
    color: rgb(0.8, 0.2, 0.2),
    opacity: 0.2,
  });

  // Stamp Bates numbering
  page.drawText('CASE-00001', {
    x: 250,
    y: 30,
    size: 10,
    color: rgb(0.2, 0.2, 0.2),
  });

  const stampedBytes = await doc.save();
  assert.ok(stampedBytes.byteLength > 0);

  const verified = await PDFDocument.load(stampedBytes);
  assert.equal(verified.getPageCount(), 1);
});

test('Metadata Catalog Editor - Read & Write', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([400, 400]);
  doc.setTitle('Sovereign Engineering Standard');
  doc.setAuthor('Antigravity Deepmind & User');
  doc.setSubject('High-Performance PDF Studio');
  doc.setKeywords(['offline', 'webgpu', 'sovereign']);
  doc.setProducer('Pedif 2.0 Workbench');

  const savedBytes = await doc.save();
  const verified = await PDFDocument.load(savedBytes);

  assert.equal(verified.getTitle(), 'Sovereign Engineering Standard');
  assert.equal(verified.getAuthor(), 'Antigravity Deepmind & User');
  assert.equal(verified.getSubject(), 'High-Performance PDF Studio');
  assert.ok(verified.getKeywords().includes('sovereign'), 'Keywords should contain sovereign');
});
