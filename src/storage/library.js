/**
 * Pedif Document Library Storage
 * Manages the persistent offline library of documents, thumbnails, and reading progress.
 */

const DB_NAME = 'pedif_library_db';
const DB_VERSION = 1;
const DOC_STORE = 'documents';

function isBufferValid(buf) {
  if (!buf) return false;
  if (!(buf instanceof ArrayBuffer)) return false;
  if (typeof buf.detached === 'boolean' && buf.detached) return false;
  if (buf.byteLength === 0) return false;
  return true;
}

class LibraryStore {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(DOC_STORE)) {
          const store = db.createObjectStore(DOC_STORE, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this);
      };
      req.onerror = (e) => {
        console.error('[LibraryStore] Open error:', e);
        reject(e);
      };
    });
  }

  async saveDocument(doc) {
    if (!this.db) {
      try {
        await this.init();
      } catch (e) {
        console.warn('[LibraryStore] Init failed:', e);
        return false;
      }
    }
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(DOC_STORE, 'readwrite');
        const store = tx.objectStore(DOC_STORE);

        // Safely verify buffer is not detached
        let safeBuffer = null;
        if (isBufferValid(doc.buffer)) {
          try {
            safeBuffer = doc.buffer.slice(0);
          } catch {
            safeBuffer = null;
          }
        }

        const stableId = doc.id || ('doc_' + encodeURIComponent(doc.name || 'doc').replace(/[^a-zA-Z0-9_]/g, '_') + '_' + (doc.pageCount || 0));

        const getReq = store.get(stableId);
        getReq.onsuccess = () => {
          try {
            const existing = getReq.result || null;
            let finalBuffer = safeBuffer;
            if (!finalBuffer && existing && isBufferValid(existing.buffer)) {
              try {
                finalBuffer = existing.buffer.slice(0);
              } catch {
                finalBuffer = null;
              }
            }

            const record = {
              id: stableId,
              name: doc.name || (existing && existing.name) || 'Untitled Document',
              size: doc.size || (finalBuffer ? finalBuffer.byteLength : (existing && existing.size) || 0),
              pageCount: doc.pageCount || (existing && existing.pageCount) || 1,
              currentPage: doc.currentPage || (existing && existing.currentPage) || 1,
              thumbnail: doc.thumbnail || (existing && existing.thumbnail) || null,
              buffer: finalBuffer,
              updatedAt: Date.now(),
              createdAt: (existing && existing.createdAt) || doc.createdAt || Date.now(),
            };

            store.put(record);
          } catch (putErr) {
            console.warn('[LibraryStore] Safe onsuccess put caught error:', putErr);
          }
        };

        getReq.onerror = () => {
          console.warn('[LibraryStore] getReq error before put');
        };

        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => {
          console.warn('[LibraryStore] save transaction error:', e);
          resolve(false);
        };
      } catch (err) {
        console.warn('[LibraryStore] Non-fatal save error:', err);
        resolve(false);
      }
    });
  }

  async listDocuments() {
    if (!this.db) {
      try {
        await this.init();
      } catch {
        return [];
      }
    }
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(DOC_STORE, 'readonly');
        const store = tx.objectStore(DOC_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
          const list = req.result || [];
          // Sort descending by updatedAt
          list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          // Return without heavy buffer for fast list rendering
          resolve(list.map(({ buffer, ...meta }) => meta));
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  async getDocument(id) {
    if (!this.db) {
      try {
        await this.init();
      } catch {
        return null;
      }
    }
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(DOC_STORE, 'readonly');
        const req = tx.objectStore(DOC_STORE).get(id);
        req.onsuccess = () => {
          const res = req.result;
          if (res && res.buffer && !isBufferValid(res.buffer)) {
            res.buffer = null;
          }
          resolve(res || null);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async removeDocument(id) {
    if (!this.db) {
      try {
        await this.init();
      } catch {
        return false;
      }
    }
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(DOC_STORE, 'readwrite');
        tx.objectStore(DOC_STORE).delete(id);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  async clearAll() {
    if (!this.db) {
      try {
        await this.init();
      } catch {
        return false;
      }
    }
    return new Promise((resolve) => {
      try {
        const tx = this.db.transaction(DOC_STORE, 'readwrite');
        tx.objectStore(DOC_STORE).clear();
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }
}

export const libraryStore = new LibraryStore();
