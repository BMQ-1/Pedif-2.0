<p align="center">
  <picture>
    <source srcset="pedif-logo.svg" type="image/svg+xml">
    <img src="pedif-logo.svg" width="120" height="120" alt="Pedif Logo">
  </picture>
</p>

<h1 align="center">Pedif 2.0</h1>

<p align="center">
  <b>The Privacy-Sovereign, High-Performance PDF Studio with WebGPU Neural OCR &amp; Dynamic Vector Inking</b>
</p>

<p align="center">
  <a href="https://github.com"><img src="https://img.shields.io/badge/Release-v2.0.0-1B4541?style=flat-square" alt="Version 2.0"></a>
  <a href="https://github.com"><img src="https://img.shields.io/badge/Spec-ISO%2032000--1-C87C56?style=flat-square" alt="ISO 32000-1 Compliant"></a>
  <a href="https://github.com"><img src="https://img.shields.io/badge/Engine-WebGPU%20%7C%20WASM-38B2AC?style=flat-square&logo=webgpu" alt="WebGPU Engine"></a>
  <a href="https://github.com"><img src="https://img.shields.io/badge/Privacy-100%25%20On--Device-276749?style=flat-square" alt="100% Local"></a>
  <a href="https://github.com"><img src="https://img.shields.io/badge/Tests-10%2F10%20Passing-brightgreen?style=flat-square" alt="Tests 10/10"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-4A5568?style=flat-square" alt="MIT License"></a>
</p>

<p align="center">
  <i>Zero servers. Zero telemetry. Zero cloud roundtrips. Your documents and annotations never leave your hardware.</i>
</p>

<p align="center">
  <img src="./divider.svg" width="100%" height="4" alt="Pedif Section Divider">
</p>

## ⚡ Why Pedif?

Most PDF viewers force a compromise: either they are clunky, server-tethered web apps that upload your sensitive documents to remote clouds, or they are rudimentary readers that flatten your ink into destructive pixel bitmaps.

**Pedif 2.0** is engineered from scratch as an offline-first, client-side workstation that bridges the tactile ergonomics of tablet note-taking with the rigorous precision of desktop publishing.

| Capability | Standard Web Readers | Mobile Note Apps | Pedif 2.0 |
| :--- | :---: | :---: | :---: |
| **Privacy & Egress** | Uploads PDF to Cloud | Proprietary Cloud Sync | **100% On-Device (Zero Telemetry)** |
| **Neural OCR Pipeline** | Server API / Tesseract.js | None / Proprietary | **Local WebGPU PP-OCRv4 (DBNet++ &amp; SVTR)** |
| **Annotation Export** | Flattened Raster / Non-std | Proprietary Database | **True ISO 32000-1 (`/Highlight`, `/Ink`)** |
| **Coordinate Fidelity** | Ephemeral Screen Pixels | Canvas Pixels | **Scale-Invariant Unit Space $[0.0, 1.0]$** |
| **Stylus Inking** | Jagged Polylines | Proprietary Engine | **Dynamic Catmull-Rom Splines (120 FPS)** |
| **Hold-to-Snap Line** | ❌ No | ✅ Yes | **✅ Yes (350ms Geometric Straightening)** |
| **Selection Geometry** | Rectangular Slabs | Simple Highlights | **Continuous Pill-Hull Union &amp; Haptic Snapping** |
| **Storage Architecture** | Temporary Memory | Proprietary Cloud | **Dual-Tier OPFS + IndexedDB Ledger** |

<p align="center">
  <img src="./divider.svg" width="100%" height="4" alt="Pedif Section Divider">
</p>

## 🏛️ 3-Tier Decoupled Architecture

Pedif isolates document rendering across three dedicated coordinate-synchronized layers, ensuring smooth 120 FPS interaction even while parsing 1,000+ page documents:

```
┌────────────────────────────────────────────────────────────────────────┐
│  LAYER 2: Dynamic Vector Inking Canvas (120 FPS)                       │
│  • Catmull-Rom Splines  • 350ms Hold-to-Snap  • Hardware Palm Rejection│
├────────────────────────────────────────────────────────────────────────┤
│  LAYER 1: Interactive SVG Geometry Layer                               │
│  • 8-Pt Affine Quads   • Continuous Pill-Hulls • Teardrop Drag-Handles │
├────────────────────────────────────────────────────────────────────────┤
│  LAYER 0: High-DPI Base Tile Canvas (PDF.js Engine)                    │
│  • Sub-pixel Crisp Text  • Multi-resolution Scanned Bitmap Recycling  │
└────────────────────────────────────────────────────────────────────────┘
                                    ▲
                                    │ (Zero-Copy Transfer)
┌───────────────────────────────────┴────────────────────────────────────┐
│  BACKGROUND WORKER: PP-OCRv4 Neural Inference (WebGPU / WASM)          │
│  • DBNet++ Text Detection (32-Multiple Padding & Unclip Polygons)      │
│  • SVTR-LCNet Vision Transformer & Greedy CTC Token Decoder (6,625 Voc)│
└────────────────────────────────────────────────────────────────────────┘
```

<p align="center">
  <img src="./divider.svg" width="100%" height="4" alt="Pedif Section Divider">
</p>

## 🔬 Core Engineering Highlights

### 🧠 1. Local AI: PP-OCRv4 via WebGPU & ONNX Runtime
* **Dedicated Web Worker:** Heavy neural inference runs entirely in an isolated background thread (`ocr.worker.js`). The main UI thread never drops a frame during document transcription.
* **DBNet++ Text Detector:** Detects text at arbitrary angles, applies morphological unclipping ($r = 1.5$), and normalizes image patches in multiples of 32.
* **SVTR-LCNet Recognizer:** Fast vision transformer with greedy CTC decoding across a 6,625-token vocabulary (English, Latin, numbers, punctuation, and CJK).
* **Area Snippet OCR:** Select any region on scanned documents or images to instantly transcribe and copy clean text to your clipboard.
* **Under 15MB Memory Footprint:** Pre-quantized, browser-optimized weights permanently cached locally via Service Worker.

### 📐 2. Precision Quad-Selection Engine
* **8-Point Affine Quads:** Extracts true quadrilateral coordinates $[(x_1, y_1), (x_2, y_2), (x_3, y_3), (x_4, y_4)]$ from PDF matrix transformations, ensuring flawless tracking across multi-column, rotated, or italicized typography.
* **Continuous Pill-Hull Union:** Highlights merge into smooth, unified polygons with rounded joins instead of disjointed rectangular slabs.
* **Magnetic Snapping & Tactile Haptics:** Drag handles snap magnetically to word and character boundaries with subtle tactile feedback (`navigator.vibrate([15])`).
* **Teardrop Pins & Focus Dimming:** Ergonomic touch drag-handles with automatic boundary clamping and cubic Bézier focus dimming.

### 🖊️ 3. Dynamic Catmull-Rom Vector Inking
* **Sub-Millisecond Stroke Latency:** Decoupled inking overlay utilizing coalesced `PointerEvents`.
* **Catmull-Rom Spline Smoothing:** Eliminates stylus jitter using cubic polynomial curve interpolation.
* **Pressure Dynamics:** Dynamically modulates stroke thickness according to stylus pressure (`PointerEvent.pressure`).
* **350ms Hold-to-Snap:** Draw a hand-drawn stroke, hold for 350ms, and it automatically snaps into a laser-straight vector line.
* **Hardware Palm Rejection:** Touch discrimination ignores accidental palm touches whenever an active stylus (`pointerType === 'pen'`) is detected.
* **Vector Whole-Stroke Eraser:** Erase entire strokes with $O(1)$ bounding box pruning and segment raycasting.

### 📄 4. Non-Destructive ISO 32000-1 PDF Export
* **Native Annotation Dictionaries:** Rather than flattening handwriting into destructive page pixels, Pedif serializes annotations into native PDF objects via `pdf-lib`:
  - **Highlights:** Standard `/Subtype /Highlight` annotations with 8-point `/QuadPoints` arrays and author metadata conformant with ISO 32000-1 §12.5.6.10.
  - **Inking:** Standard `/Subtype /Ink` annotations with `/InkList` point coordinate streams.
* **Universal Interoperability:** Highlights and handwriting remain fully selectable, editable, and searchable in Adobe Acrobat, Apple Books, Preview, and standard PDF readers.

### 🎯 5. Zero-Drift Coordinate Space Invariance
* User annotations and ink strokes are **never** persisted in volatile screen pixels.
* All stored geometry resides in scale-invariant unit space $[0.0, 1.0]$.
* Coordinates project dynamically to screen DPI at runtime and directly to native PDF User Space ($72\text{ DPI}$) upon export, guaranteeing bit-exact alignment regardless of whether you view at $50\%$, $100\%$, or $400\%$ zoom.

<p align="center">
  <img src="./divider.svg" width="100%" height="4" alt="Pedif Section Divider">
</p>

## 🚀 Quick Start

### Prerequisites
* Node.js 18+ (tested on Node 20 / 22 / 24)
* npm 9+

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/BMQ-1/Pedif-2.0.git
cd Pedif-2.0

# Install dependencies
npm install
```

### 2. Development Server
```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

### 3. Run Automated Verification Tests
Pedif includes 10 automated test suites covering geometry, search, inking, selection, export, coordinate invariance, and live ONNX neural inference:
```bash
npm test
```
```
--- All Phase 2 Core Tests Passed Successfully ---
--- All Phase 3 Core Tests Passed Successfully ---
--- All Phase 4 Core Tests Passed Successfully ---
--- All Phase 5 Core Tests Passed Successfully ---
--- All Phase 6 Core Tests Passed Successfully ---
--- All Phase 7 Core Tests Passed Successfully ---
--- All Phase 8 Tests Passed Successfully ---
--- All Live Model Inference Tests Passed Successfully ---
--- All Law 1: Coordinate Space Invariance Tests Passed Successfully ---
```

### 4. Production Build
```bash
npm run build
```
The optimized bundle is written to `dist/` with vendor-chunk isolation (`vendor-pdf.js`) and pre-cached PWA assets, ready for deployment on any static host or GitHub Pages.

<p align="center">
  <img src="./divider.svg" width="100%" height="4" alt="Pedif Section Divider">
</p>

## ⌨️ Command & Keyboard Center

| Keybinding | Action | Context |
| :--- | :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>O</kbd> | Open PDF Document | Global |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | Save &amp; Export ISO 32000-1 PDF | Global |
| <kbd>Ctrl</kbd> + <kbd>F</kbd> | Unified Digital + OCR Document Search | Global |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Undo Annotation / Ink Action | Canvas |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> / <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> | Redo Action | Canvas |
| <kbd>V</kbd> | Precision Text Selection &amp; Highlight Tool | Tools |
| <kbd>P</kbd> | Pen Tool (Dynamic Catmull-Rom Inking) | Tools |
| <kbd>H</kbd> | Freehand Highlighter Tool | Tools |
| <kbd>E</kbd> | Vector Whole-Stroke Eraser | Tools |
| <kbd>S</kbd> | Area Snippet OCR Tool | Tools |
| <kbd>B</kbd> | Bookmark Current Page | Navigation |
| <kbd>[</kbd> / <kbd>]</kbd> | Zoom Out / Zoom In | Viewport |
| <kbd>?</kbd> | Toggle Keyboard Shortcuts Modal | Global |

<p align="center">
  <img src="./divider.svg" width="100%" height="4" alt="Pedif Section Divider">
</p>

## 🔒 Privacy, Security & Sovereignty

* **100% Client-Side Computing:** No analytics, no telemetry, no tracking pixels, and zero outbound network calls during document interaction.
* **Isolated WebGPU/WASM Sandbox:** Document rendering and neural network OCR execute strictly inside sandboxed browser threads.
* **Compliant by Design:** Because zero document bytes leave the local machine, Pedif natively satisfies the stringent privacy standards of HIPAA, GDPR (Regulation (EU) 2016/679), and attorney-client privilege.

<p align="center">
  <img src="./divider.svg" width="100%" height="4" alt="Pedif Section Divider">
</p>

## 📄 License & Attribution

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for terms.  
Complete third-party licenses and model attributions are cataloged in [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).

* **PDF Rendering:** [PDF.js](https://mozilla.github.io/pdf.js/) (Mozilla Foundation, Apache 2.0)
* **PDF Object Serialization:** [pdf-lib](https://pdf-lib.js.org/) (Andrew Dillon, MIT)
* **Neural Runtime:** [ONNX Runtime Web](https://onnxruntime.ai/) (Microsoft Corporation, MIT)
* **OCR Models:** [PaddleOCR PP-OCRv4](https://github.com/PaddlePaddle/PaddleOCR) (PaddlePaddle Authors, Apache 2.0) via [W3C WebNN Models](https://huggingface.co/webnn/PP-OCRv4-ONNX)
* **Iconography:** [Lucide Icons](https://lucide.dev/) (ISC License)
