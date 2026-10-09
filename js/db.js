// Хранилище на устройстве (IndexedDB). Картинки лежат как ArrayBuffer —
// так надёжнее в Safari на iOS, чем Blob.

const DB_NAME = 'garderob';
const DB_VERSION = 1;
const STORES = ['items', 'outfits', 'thumbs', 'fulls', 'origs', 'previews', 'kv'];

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, name === 'kv' ? undefined : { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('База занята другой вкладкой'));
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result;
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Не удалось записать данные'));
    result = fn(t);
  });
}

export const db = {
  async all(store) {
    const d = await open();
    return wrap(d.transaction(store).objectStore(store).getAll());
  },
  async get(store, key) {
    const d = await open();
    return wrap(d.transaction(store).objectStore(store).get(key));
  },
  put(store, value, key) {
    return tx([store], 'readwrite', (t) => {
      t.objectStore(store).put(value, key);
    });
  },
  del(store, key) {
    return tx([store], 'readwrite', (t) => {
      t.objectStore(store).delete(key);
    });
  },
  // Несколько записей одной транзакцией: ops = [[store, 'put'|'delete', value|key], ...]
  batch(ops) {
    const stores = [...new Set(ops.map((o) => o[0]))];
    return tx(stores, 'readwrite', (t) => {
      for (const [store, op, v] of ops) {
        if (op === 'put') t.objectStore(store).put(v);
        else t.objectStore(store).delete(v);
      }
    });
  },
  async keys(store) {
    const d = await open();
    return wrap(d.transaction(store).objectStore(store).getAllKeys());
  },
  async clearAll() {
    return tx(STORES, 'readwrite', (t) => {
      for (const s of STORES) t.objectStore(s).clear();
    });
  },
  kvGet(key) {
    return this.get('kv', key);
  },
  kvSet(key, value) {
    return this.put('kv', value, key);
  },
};

export const IMAGE_STORES = ['thumbs', 'fulls', 'origs', 'previews'];

export async function blobToRecord(id, blob) {
  return { id, type: blob.type || 'image/png', buf: await blob.arrayBuffer() };
}
export function recordToBlob(rec) {
  return new Blob([rec.buf], { type: rec.type });
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
