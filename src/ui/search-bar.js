/**
 * Search Bar Component
 * Floating Apple-style search pill with live match counter and keyboard navigation.
 */

import { searchEngine } from '../core/search-engine.js';

export class SearchBar {
  constructor(options = {}) {
    this.onMatchSelect = options.onMatchSelect || null;
    this.container = null;
    this.input = null;
    this.counter = null;
    this.isOpen = false;

    this.render();
    this.setupListeners();
  }

  render() {
    this.container = document.createElement('div');
    this.container.className = 'search-bar-pill';
    this.container.style.display = 'none';

    this.container.innerHTML = `
      <div class="search-input-wrapper">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input type="text" id="search-input" placeholder="Find in document..." autocomplete="off" spellcheck="false">
        <span id="search-counter" class="search-counter"></span>
      </div>
      <div class="search-actions">
        <button class="b sm" id="btn-search-prev" title="Previous match (Shift+Enter)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
        <button class="b sm" id="btn-search-next" title="Next match (Enter)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <button class="b sm" id="btn-search-close" title="Close (Esc)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;

    document.body.appendChild(this.container);

    this.input = this.container.querySelector('#search-input');
    this.counter = this.container.querySelector('#search-counter');
  }

  setupListeners() {
    let debounceTimer = null;

    this.input.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        searchEngine.search(e.target.value);
      }, 150);
    });

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          const res = searchEngine.prevMatch();
          this.handleMatchChange(res);
        } else {
          const res = searchEngine.nextMatch();
          this.handleMatchChange(res);
        }
      } else if (e.key === 'Escape') {
        this.close();
      }
    });

    this.container.querySelector('#btn-search-prev').addEventListener('click', () => {
      const res = searchEngine.prevMatch();
      this.handleMatchChange(res);
    });

    this.container.querySelector('#btn-search-next').addEventListener('click', () => {
      const res = searchEngine.nextMatch();
      this.handleMatchChange(res);
    });

    this.container.querySelector('#btn-search-close').addEventListener('click', () => {
      this.close();
    });

    // Listen to search engine state changes
    searchEngine.onChange(({ query, totalMatches, activeMatch }) => {
      if (!query) {
        this.counter.textContent = '';
        return;
      }
      if (totalMatches === 0) {
        this.counter.textContent = '0 / 0';
        this.counter.classList.add('no-matches');
      } else {
        this.counter.classList.remove('no-matches');
        const currentIdx = activeMatch ? activeMatch.index : 0;
        this.counter.textContent = `${currentIdx} of ${totalMatches}`;
      }

      if (activeMatch) {
        this.handleMatchChange(activeMatch);
      }
    });

    // Dismiss search bar on click outside if search input is blank
    document.addEventListener('click', (e) => {
      if (this.isOpen && !this.container.contains(e.target)) {
        const btnSearch = document.getElementById('btn-search');
        if (btnSearch && (btnSearch === e.target || btnSearch.contains(e.target))) {
          return;
        }
        if (!this.input.value.trim()) {
          this.close();
        }
      }
    });
  }

  handleMatchChange(activeMatch) {
    if (!activeMatch || !activeMatch.match) return;
    if (typeof this.onMatchSelect === 'function') {
      this.onMatchSelect(activeMatch.match);
    }
  }

  open() {
    // Dynamic anchor positioning right beneath btn-search
    const btnSearch = document.getElementById('btn-search');
    if (btnSearch) {
      const rect = btnSearch.getBoundingClientRect();
      const pillW = this.container.offsetWidth || 340;
      let left = rect.right - pillW;
      if (left < 16) left = 16;
      if (left + pillW > window.innerWidth - 16) {
        left = window.innerWidth - pillW - 16;
      }
      this.container.style.position = 'fixed';
      this.container.style.top = `${rect.bottom + 8}px`;
      this.container.style.left = `${left}px`;
      this.container.style.right = 'auto';
    }

    // Mutual exclusion: Close workbench popover if open
    const popover = document.getElementById('workbench-popover');
    if (popover) popover.hidden = true;

    this.container.style.display = 'flex';
    this.isOpen = true;
    this.input.focus();
    this.input.select();
  }

  close() {
    this.container.style.display = 'none';
    this.isOpen = false;
    searchEngine.clear();
    if (typeof this.onMatchSelect === 'function') {
      this.onMatchSelect(null);
    }
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }
}
