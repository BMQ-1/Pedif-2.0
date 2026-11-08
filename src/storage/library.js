/**
 * Pedif Document Library Storage
 * Manages the persistent offline library of documents, thumbnails, and reading progress.
 */

const DB_NAME = 'pedif_library_db';
const DB_VERSION = 1;
const DOC_STORE = 'documents';

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
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(DOC_STORE, 'readwrite');
      const store = tx.objectStore(DOC_STORE);
      const record = {
        id: doc.id || ('doc_' + Date.now()),
        name: doc.name || 'Untitled Document',
        size: doc.size || (doc.buffer ? doc.buffer.byteLength : 0),
        pageCount: doc.pageCount || 1,
        currentPage: doc.currentPage || 1,
        thumbnail: doc.thumbnail || null, // data URL of first page
        buffer: doc.buffer || null, // ArrayBuffer
        updatedAt: Date.now(),
        createdAt: doc.createdAt || Date.now(),
      };
      store.put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = (e) => reject(e);
    });
  }

  async listDocuments() {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
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
    });
  }

  async getDocument(id) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const tx = this.db.transaction(DOC_STORE, 'readonly');
      const req = tx.objectStore(DOC_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  async removeDocument(id) {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const tx = this.db.transaction(DOC_STORE, 'readwrite');
      tx.objectStore(DOC_STORE).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  async clearAll() {
    if (!this.db) await this.init();
    return new Promise((resolve) => {
      const tx = this.db.transaction(DOC_STORE, 'readwrite');
      tx.objectStore(DOC_STORE).clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }
}

export const libraryStore = new LibraryStore();
