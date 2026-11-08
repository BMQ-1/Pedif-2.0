/**
 * Floating Ergonomic Inking Toolbar
 * Provides quick color swatches and stroke thickness options for Pen and Highlighter.
 */

export const PEN_PRESETS = [
  { color: '#1c1c1e', label: 'Ink Black' },
  { color: '#007aff', label: 'Royal Navy' },
  { color: '#ff3b30', label: 'Crimson' },
  { color: '#34c759', label: 'Emerald' },
  { color: '#ff9500', label: 'Amber' },
];

export const HIGHLIGHTER_PRESETS = [
  { color: 'rgba(250, 204, 21, 0.45)', hex: '#facc15', label: 'Neon Yellow' },
  { color: 'rgba(74, 222, 128, 0.45)',  hex: '#4ade80', label: 'Pastel Green' },
  { color: 'rgba(244, 63, 94, 0.40)',   hex: '#f43f5e', label: 'Rose Pink' },
  { color: 'rgba(56, 189, 248, 0.42)',  hex: '#38bdf8', label: 'Sky Blue' },
  { color: 'rgba(192, 132, 252, 0.42)', hex: '#c084fc', label: 'Lilac' },
];

export class InkToolbar {
  constructor(options = {}) {
    this.inkEngine = options.inkEngine;
    this.container = null;
    this.currentMode = null;
    this.activePenColor = PEN_PRESETS[0].color;
    this.activePenWidth = 3;
    this.activeHighlighterColor = HIGHLIGHTER_PRESETS[0].color;
    this.activeHighlighterWidth = 20;

    this.render();
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'ink-subtoolbar';
    this.container.style.display = 'none';

    (document.getElementById('rd') || document.body).appendChild(this.container);
    this.updateToolBadges();
  }

  updateToolBadges() {
    if (typeof document === 'undefined') return;

    const penBtn = document.getElementById('tool-pen');
    if (penBtn) {
      let dot = penBtn.querySelector('.ink-badge-dot');
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'ink-badge-dot';
        penBtn.appendChild(dot);
      }
      dot.style.backgroundColor = this.activePenColor;
    }

    const hlBtn = document.getElementById('tool-highlighter');
    if (hlBtn) {
      let dot = hlBtn.querySelector('.ink-badge-dot');
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'ink-badge-dot';
        hlBtn.appendChild(dot);
      }
      const p = HIGHLIGHTER_PRESETS.find(item => item.color === this.activeHighlighterColor);
      dot.style.backgroundColor = (p && p.hex) || '#facc15';
    }
  }

  setMode(mode) {
    this.currentMode = mode;
    if (mode !== 'pen' && mode !== 'highlighter' && mode !== 'eraser') {
      this.hide();
      return;
    }

    this.updateContent();
    this.show();
  }

  show() {
    this.container.style.display = 'flex';
    requestAnimationFrame(() => {
      this.container.classList.add('visible');
    });
  }

  hide() {
    this.container.classList.remove('visible');
    setTimeout(() => {
      if (!this.container.classList.contains('visible')) {
        this.container.style.display = 'none';
      }
    }, 200);
  }

  updateEraserCursor() {
    if (typeof document === 'undefined') return;
    const r = (this.inkEngine && this.inkEngine.eraserRadius) || 24;
    const size = Math.max(24, r * 2 + 8);
    const center = Math.round(size / 2);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${center}" cy="${center}" r="${r}" fill="rgba(255,59,48,0.18)" stroke="%23ff3b30" stroke-width="1.5"/></svg>`;
    const cursorStyle = `url('data:image/svg+xml;utf8,${svg}') ${center} ${center}, crosshair`;

    const styleEl = document.getElementById('dynamic-eraser-cursor') || document.createElement('style');
    styleEl.id = 'dynamic-eraser-cursor';
    styleEl.textContent = `
      .layer-2-ink.mode-eraser,
      [data-tool="eraser"] .layer-2-ink {
        cursor: ${cursorStyle} !important;
      }
    `;
    if (!document.getElementById('dynamic-eraser-cursor')) {
      document.head.appendChild(styleEl);
    }
  }

  updateContent() {
    if (this.currentMode === 'eraser') {
      this.updateEraserCursor();
      const mode = (this.inkEngine && this.inkEngine.eraserMode) || 'whole';
      const radius = (this.inkEngine && this.inkEngine.eraserRadius) || 24;
      const radii = [
        { val: 14, label: 'Fine' },
        { val: 24, label: 'Med' },
        { val: 40, label: 'Broad' },
      ];

      const modesHtml = `
        <button class="width-btn ${mode === 'whole' ? 'selected' : ''}" id="btn-eraser-whole" title="Erase entire strokes instantly">Whole Stroke</button>
        <button class="width-btn ${mode === 'segment' ? 'selected' : ''}" id="btn-eraser-segment" title="Erase precise stroke segments">Segment</button>
      `;

      const radiiHtml = radii.map(r => {
        const isSel = radius === r.val;
        return `<button class="width-btn ${isSel ? 'selected' : ''}" data-radius="${r.val}">${r.label}</button>`;
      }).join('');

      this.container.innerHTML = `
        <div class="ink-toolbar-group">
          ${modesHtml}
        </div>
        <div class="ink-toolbar-divider"></div>
        <div class="ink-toolbar-group">
          ${radiiHtml}
        </div>
      `;

      this.container.querySelector('#btn-eraser-whole')?.addEventListener('click', () => {
        if (this.inkEngine) this.inkEngine.setEraserMode('whole');
        this.updateContent();
      });

      this.container.querySelector('#btn-eraser-segment')?.addEventListener('click', () => {
        if (this.inkEngine) this.inkEngine.setEraserMode('segment');
        this.updateContent();
      });

      this.container.querySelectorAll('[data-radius]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const r = parseInt(e.currentTarget.dataset.radius, 10);
          if (this.inkEngine) this.inkEngine.setEraserRadius(r);
          this.updateContent();
        });
      });

      return;
    }

    const isPen = this.currentMode === 'pen';
    const presets = isPen ? PEN_PRESETS : HIGHLIGHTER_PRESETS;
    const activeColor = isPen ? this.activePenColor : this.activeHighlighterColor;
    const activeWidth = isPen ? this.activePenWidth : this.activeHighlighterWidth;

    this.updateToolBadges();

    const widths = isPen 
      ? [{ val: 2, label: 'Fine' }, { val: 4, label: 'Med' }, { val: 7, label: 'Bold' }]
      : [{ val: 14, label: 'Thin' }, { val: 22, label: 'Med' }, { val: 32, label: 'Wide' }];

    const swatchesHtml = presets.map((p, idx) => {
      const isSelected = isPen ? (this.activePenColor === p.color) : (this.activeHighlighterColor === p.color);
      const bg = p.hex || p.color;
      return `<button class="ink-chip ${isSelected ? 'selected' : ''}" data-idx="${idx}" style="background-color: ${bg};" title="${p.label}"></button>`;
    }).join('');

    const widthsHtml = widths.map(w => {
      const isSelected = activeWidth === w.val;
      return `<button class="width-btn ${isSelected ? 'selected' : ''}" data-val="${w.val}">${w.label}</button>`;
    }).join('');

    this.container.innerHTML = `
      <div class="ink-toolbar-group ink-swatches">
        ${swatchesHtml}
      </div>
      <div class="ink-toolbar-divider"></div>
      <div class="ink-toolbar-group ink-widths">
        ${widthsHtml}
      </div>
    `;

    // Bind swatch events
    this.container.querySelectorAll('.ink-chip').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        const selected = presets[idx];
        if (isPen) {
          this.activePenColor = selected.color;
          if (this.inkEngine) this.inkEngine.setPenColor(selected.color);
        } else {
          this.activeHighlighterColor = selected.color;
          if (this.inkEngine) this.inkEngine.highlighterColor = selected.color;
        }
        this.updateContent();
      });
    });

    // Bind width events
    this.container.querySelectorAll('.width-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const val = parseInt(e.currentTarget.dataset.val, 10);
        if (isPen) {
          this.activePenWidth = val;
          if (this.inkEngine) this.inkEngine.setPenWidth(val);
        } else {
          this.activeHighlighterWidth = val;
          if (this.inkEngine) this.inkEngine.highlighterWidth = val;
        }
        this.updateContent();
      });
    });
  }
}
