<p align="center">
  <picture>
    <source srcset="pedif-logo.svg" type="image/svg+xml">
    <img src="pedif-logo.svg" width="128" height="128" alt="Pedif Logo">
  </picture>
</p>

<h1 align="center">Pedif 2.0</h1>

<p align="center">
  <b>The Privacy-First, High-Performance PDF Studio with WebGPU PP-OCRv4 &amp; Vector Inking</b>
</p>

<p align="center">
  <a href="https://github.com"><img src="https://img.shields.io/badge/PWA-Ready-success?style=flat-square&logo=pwa" alt="PWA Ready"></a>
  <a href="https://github.com"><img src="https://img.shields.io/badge/Engine-WebGPU%20%7C%20ONNX-blueviolet?style=flat-square&logo=webgpu" alt="WebGPU Engine"></a>
  <a href="https://github.com"><img src="https://img.shields.io/badge/Spec-ISO%2032000--1-informational?style=flat-square" alt="ISO 32000-1"></a>
  <a href="https://github.com"><img src="https://img.shields.io/badge/Privacy-100%25%20On--Device-brightgreen?style=flat-square" alt="100% Local"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=flat-square" alt="MIT License"></a>
</p>

<p align="center">
  <i>Zero servers. Zero tracking. Zero cloud uploads. Your books and annotations never leave your browser.</i>
</p>

---

## 🌟 Overview

**Pedif 2.0** is an offline-first, client-side PDF studio engineered for high-performance reading, precision vector inking, and on-device machine learning. 

Built on a **3-tier decoupled rendering architecture**, Pedif pairs a **WebGPU-accelerated PP-OCRv4 pipeline** with an advanced **Precision Quad-Selection Engine** and **Dynamic Catmull-Rom Vector Inking**. Every stroke and highlight exports back into true, non-destructive **ISO 32000-1 PDF annotations** readable by native PDF viewers.

---

## ⚡ Core Innovations

### 🧠 1. Local AI: PP-OCRv4 via WebGPU & ONNX Runtime
* **Dedicated Web Worker:** Runs optical character recognition entirely in the background without blocking the UI thread.
* **DBNet++ Text Detector:** Detects arbitrary text orientations, unclips polygons, and normalizes image patches in multiples of 32.
* **SVTR-LCNet Recognizer:** Fast vision transformer with greedy CTC decoding across a 6,625-token vocabulary (English, Latin, numbers, punctuation, and CJK).
* **Area Snippet OCR:** Drag a box anywhere on scanned documents or images to instantly transcribe and copy text to your clipboard.
* **Under 15MB Footprint:** Pre-quantized, browser-optimized weights permanently cached via Service Worker.

### 📐 2. Precision Quad-Selection Engine
*(Clean-room implementation inspired by modern mobile selection mechanics)*
* **8-Point Affine Quads:** Extracts true quadrilateral coordinates $[(x_1, y_1), (x_2, y_2), (x_3, y_3), (x_4, y_4)]$ from PDF matrix transformations, ensuring flawless tracking across multi-column, rotated, or italicized typography.
* **Continuous Pill-Hull Union:** Highlights merge into smooth, unified polygons with rounded joins instead of disjointed rectangular slabs.
* **Magnetic Snapping & Haptics:** Drag handles snap magnetically to word and character boundaries with subtle tactile feedback (`navigator.vibrate(5)`).
* **Teardrop Pins & Focus Dimming:** Mobile-native selection pins with automatic RTL inversion and cubic Bézier focus dimming.

### 🖊️ 3. Dynamic Catmull-Rom Vector Inking
* **120 FPS High-DPI Canvas:** Decoupled inking overlay with sub-millisecond stroke latency.
* **Catmull-Rom Spline Smoothing:** Eliminates stylus jitter using coalesced input events and cubic polynomial interpolation.
* **Pressure Dynamics:** Dynamically scales stroke width according to stylus pressure (`PointerEvent.pressure`).
* **350ms Hold-to-Snap:** Draw a wobbly line, hold for 350ms, and it automatically snaps into a straight vector segment with haptic feedback.
* **Palm Rejection:** Hardware-enforced touch discrimination ignores accidental palm touches whenever a stylus (`pointerType === 'pen'`) is active.
* **Vector Whole-Stroke Eraser:** Erase entire strokes with $O(1)$ bounding box queries and line-segment ray intersection math.

### 📄 4. Non-Destructive ISO 32000-1 PDF Export
* **Native Annotation Dicts:** Unlike tools that flatten drawings into raster pixels, Pedif serializes annotations into native PDF objects via `pdf-lib`:
  - **Highlights:** Standard `/Subtype /Highlight` annotations with 8-point `/QuadPoints` arrays and author metadata.
  - **Inking:** Standard `/Subtype /Ink` annotations with `/InkList` point coordinate streams.
* **Universal Interoperability:** Highlights and handwriting remain fully selectable, editable, and searchable in Adobe Acrobat, Apple Books, Preview, and standard PDF readers.

### 🔍 5. Unified Full-Document Search (`Ctrl + F`)
* **Hybrid Indexing:** Indexes both native digital PDF text and background OCR transcriptions simultaneously.
* **Instant Match Navigation:** Keyboard shortcuts (`Enter` / `Shift + Enter`) cycle through search hits with smooth scrolling and pulsing selection quads.

### 💾 6. Dual-Tier Zero-Data-Loss Engine
* **OPFS (Origin Private File System):** High-speed sandboxed virtual disk storage for gigabyte-scale documents.
* **IndexedDB Transaction Ledger:** Persists stroke buffers, highlights, and bookmarks with automatic crash recovery.

### 📖 7. Ergonomics & Scanned Book Tools
* **Auto-Trim White Margins:** Scans scanned page luminance and clips excess white borders with hardware-accelerated CSS clipping, allowing text to expand and fill the screen.
* **Two-Page Spread Mode:** Read double-page book layouts side-by-side in landscape.
* **Live Sidebar Previews:** On-demand miniature canvas previews virtualized via `IntersectionObserver`.

---

## 🏛️ Architecture Stack

Pedif decouples rendering across three isolated layers to guarantee buttery 60/120 FPS performance:

```
┌────────────────────────────────────────────────────────┐
│  LAYER 2: Vector Inking Canvas (120 FPS, PointerEvents)│  <- Catmull-Rom, Hold-to-Snap, Eraser
├────────────────────────────────────────────────────────┤
│  LAYER 1: Interactive SVG Layer (DOM & Selection)      │  <- 8-Pt Quads, Teardrop Pins, Highlights
├────────────────────────────────────────────────────────┤
│  LAYER 0: High-DPI PDF Tile Canvas (PDF.js Engine)     │  <- Crisp base text & scanned imagery
└────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
* Node.js 18+ (tested on Node 20 / 22 / 24)
* npm 9+

### Installation
```bash
# Clone or enter the repository directory
cd Pedif

# Install dependencies
npm install

# Start local development server
npm run dev
```

Open `http://localhost:5173` in your browser.

### Verification Tests
Pedif includes end-to-end unit tests covering geometry, search, inking, selection, export, and live ONNX neural inference:
```bash
npm test
```

### Production Build
```bash
npm run build
```
The output will be bundled into `dist/` with code-split vendor chunks and pre-cached PWA assets, ready to be hosted on any static web server or GitHub Pages.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>O</kbd> | Open PDF Document |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | Save &amp; Export ISO 32000-1 PDF |
| <kbd>Ctrl</kbd> + <kbd>F</kbd> | Unified Document Search |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Undo Annotation / Ink Action |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> | Redo Action |
| <kbd>V</kbd> | Select / Text Highlight Tool |
| <kbd>P</kbd> | Pen Tool (Catmull-Rom Inking) |
| <kbd>H</kbd> | Freehand Highlighter Tool |
| <kbd>E</kbd> | Vector Whole-Stroke Eraser |
| <kbd>S</kbd> | Area Snippet OCR Tool |
| <kbd>B</kbd> | Bookmark Current Page |
| <kbd>[</kbd> / <kbd>]</kbd> | Zoom Out / Zoom In |
| <kbd>?</kbd> | Open Shortcuts Reference Cheat-Sheet |

---

## 🔒 Privacy & Security Guarantee

* **100% Client-Side:** No analytics, no telemetry, no tracking scripts, and zero outbound network calls during document viewing.
* **Isolated Processing:** PDF rendering and neural network OCR run exclusively within sandboxed browser contexts on your CPU/GPU.
* **Self-Contained Deployment:** Can be compiled and served entirely offline or hosted on GitHub Pages with complete data sovereignty.

---

## 📄 License & Credits

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.
For complete third-party dependency licenses and model attributions, see [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).

* **PDF Engine:** [PDF.js](https://mozilla.github.io/pdf.js/) (Mozilla Foundation, Apache 2.0) & [pdf-lib](https://pdf-lib.js.org/) (Andrew Dillon, MIT).
* **Neural Runtime:** [ONNX Runtime Web](https://onnxruntime.ai/) (Microsoft Corporation, MIT) & [WebNN](https://www.w3.org/community/webmachinelearning/).
* **OCR Models:** [PaddleOCR (PP-OCRv4)](https://github.com/PaddlePaddle/PaddleOCR) (PaddlePaddle Authors, Apache 2.0) & [W3C WebNN Models](https://huggingface.co/webnn/PP-OCRv4-ONNX).
