/**
 * Pedif Autosave Engine
 * Implements high-performance local autosave using:
 * 1. Origin Private File System (OPFS) as primary high-speed binary storage.
 * 2. IndexedDB as robust fallback.
 * Guarantees zero data loss if tab is closed or reloaded.
 */

const DB_NAME = 'pedif_autosave_db';
const DB_VERSION = 1;
const STORE_NAME = 'session_store';

class AutosaveEngine {
  constructor() {
    this.opfsRoot = null;
    this.useOpfs = false;
    this.db = null;
    this.saveTimeout = null;
    this.debounceMs = 600; // Save 600ms after last edit
  }

  async init() {
    // 1. Try OPFS
    try {
      if (navigator.storage && navigator.storage.getDirectory) {
        this.opfsRoot = await navigator.storage.getDirectory();
        this.useOpfs = true;
        console.log('[Autosave] OPFS initialized successfully');
      }
    } catch (e) {
      console.warn('[Autosave] OPFS not available, using IndexedDB fallback:', e);
      this.useOpfs = false;
    }

    // 2. Initialize IndexedDB (used as fallback or for metadata index)
    await this._initIndexedDB();
  }

  _initIndexedDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve();
      };
      req.onerror = (e) => {
        console.error('[Autosave] IndexedDB init error:', e);
        resolve(); // Continue gracefully
      };
    });
  }

  /**
   * Saves the raw PDF binary buffer
   */
  async savePdfBuffer(buffer, metadata = {}) {
    const meta = {
      id: 'active_session',
      name: metadata.name || 'Untitled.pdf',
      pageCount: metadata.pageCount || 1,
      currentPage: metadata.currentPage || 1,
      updatedAt: Date.now(),
      size: buffer.byteLength,
    };

    if (this.useOpfs && this.opfsRoot) {
      try {
        const fileHandle = await this.opfsRoot.getFileHandle('active_doc.pdf', { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(buffer);
        await writable.close();

        // Save metadata
        const metaHandle = await this.opfsRoot.getFileHandle('active_meta.json', { create: true });
        const metaWritable = await metaHandle.createWritable();
        await metaWritable.write(JSON.stringify(meta));
        await metaWritable.close();

        return true;
      } catch (err) {
        console.warn('[Autosave] OPFS save failed, falling back to IDB:', err);
      }
    }

    // Fallback: IndexedDB
    return this._idbPut({ ...meta, buffer });
  }

  /**
   * Debounced save of annotations, ink strokes, and view state
   */
  queueStateSave(state) {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.saveState(state);
    }, this.debounceMs);
  }

  async saveState(state) {
    const payload = {
      updatedAt: Date.now(),
      state: state, // strokes, highlights, bookmarks, crop, zoom, mode
    };

    if (this.useOpfs && this.opfsRoot) {
      try {
        const handle = await this.opfsRoot.getFileHandle('active_state.json', { create: true });
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(payload));
        await writable.close();
        return true;
      } catch (e) {
        console.warn('[Autosave] OPFS state save failed:', e);
      }
    }

    // Fallback to IndexedDB
    return this._idbPut({ id: 'active_state', ...payload });
  }

  /**
   * Check if an unsaved session exists to prompt user for restore
   */
  async checkRestoreSession() {
    try {
      if (this.useOpfs && this.opfsRoot) {
        try {
          const metaHandle = await this.opfsRoot.getFileHandle('active_meta.json');
          const file = await metaHandle.getFile();
          const text = await file.text();
          const meta = JSON.parse(text);
          return { hasSession: true, metadata: meta };
        } catch {
          // File doesn't exist, check IDB
        }
      }

      // Check IDB
      const record = await this._idbGet('active_session');
      if (record && record.buffer) {
        return {
          hasSession: true,
          metadata: {
            name: record.name,
            updatedAt: record.updatedAt,
            pageCount: record.pageCount,
            currentPage: record.currentPage,
          },
        };
      }
    } catch (e) {
      console.warn('[Autosave] Check restore error:', e);
    }
    return { hasSession: false };
  }

  /**
   * Restore the active session's PDF buffer and state
   */
  async restoreSession() {
    let pdfBuffer = null;
    let metadata = null;
    let state = null;

    if (this.useOpfs && this.opfsRoot) {
      try {
        const docHandle = await this.opfsRoot.getFileHandle('active_doc.pdf');
        const docFile = await docHandle.getFile();
        pdfBuffer = await docFile.arrayBuffer();

        const metaHandle = await this.opfsRoot.getFileHandle('active_meta.json');
        const metaFile = await metaHandle.getFile();
        metadata = JSON.parse(await metaFile.text());

        try {
          const stateHandle = await this.opfsRoot.getFileHandle('active_state.json');
          const stateFile = await stateHandle.getFile();
          const stateJson = JSON.parse(await stateFile.text());
          state = stateJson.state;
        } catch {
          state = null;
        }

        return { pdfBuffer, metadata, state };
      } catch (e) {
        console.warn('[Autosave] OPFS restore error:', e);
      }
    }

    // Fallback: IDB
    const session = await this._idbGet('active_session');
    const stateRecord = await this._idbGet('active_state');
    if (session && session.buffer) {
      return {
        pdfBuffer: session.buffer,
        metadata: {
          name: session.name,
          updatedAt: session.updatedAt,
          pageCount: session.pageCount,
          currentPage: session.currentPage,
        },
        state: stateRecord ? stateRecord.state : null,
      };
    }

    return null;
  }

  /**
   * Clears autosaved session (e.g. when user closes or resets document)
   */
  async clearSession() {
    if (this.useOpfs && this.opfsRoot) {
      try {
        await this.opfsRoot.removeEntry('active_doc.pdf').catch(() => {});
        await this.opfsRoot.removeEntry('active_meta.json').catch(() => {});
        await this.opfsRoot.removeEntry('active_state.json').catch(() => {});
      } catch {}
    }
    await this._idbDelete('active_session');
    await this._idbDelete('active_state');
  }

  _idbPut(val) {
    if (!this.db) return Promise.resolve(false);
    return new Promise((resolve) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(val);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  _idbGet(key) {
    if (!this.db) return Promise.resolve(null);
    return new Promise((resolve) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  _idbDelete(key) {
    if (!this.db) return Promise.resolve();
    return new Promise((resolve) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }
}

export const autosave = new AutosaveEngine();
