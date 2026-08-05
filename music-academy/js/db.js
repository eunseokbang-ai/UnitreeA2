const DB_NAME = 'academyDB';
const DB_VERSION = 1;

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('students')) {
        const store = db.createObjectStore('students', { keyPath: 'id', autoIncrement: true });
        store.createIndex('studentNo', 'studentNo', { unique: true });
        store.createIndex('name', 'name', { unique: false });
      }
      if (!db.objectStoreNames.contains('attendance')) {
        const store = db.createObjectStore('attendance', { keyPath: 'id', autoIncrement: true });
        store.createIndex('studentId', 'studentId', { unique: false });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('studentId_date', ['studentId', 'date'], { unique: true });
      }
      if (!db.objectStoreNames.contains('payments')) {
        const store = db.createObjectStore('payments', { keyPath: 'id', autoIncrement: true });
        store.createIndex('studentId', 'studentId', { unique: false });
        store.createIndex('studentId_month', ['studentId', 'yearMonth'], { unique: true });
      }
      if (!db.objectStoreNames.contains('progress')) {
        const store = db.createObjectStore('progress', { keyPath: 'id', autoIncrement: true });
        store.createIndex('studentId', 'studentId', { unique: false });
        store.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const DB = {
  async add(storeName, value) {
    const store = await tx(storeName, 'readwrite');
    return reqToPromise(store.add(value));
  },
  async put(storeName, value) {
    const store = await tx(storeName, 'readwrite');
    return reqToPromise(store.put(value));
  },
  async get(storeName, key) {
    const store = await tx(storeName);
    return reqToPromise(store.get(key));
  },
  async getAll(storeName) {
    const store = await tx(storeName);
    return reqToPromise(store.getAll());
  },
  async getAllByIndex(storeName, indexName, query) {
    const store = await tx(storeName);
    const idx = store.index(indexName);
    return reqToPromise(idx.getAll(query));
  },
  async getByIndex(storeName, indexName, query) {
    const store = await tx(storeName);
    const idx = store.index(indexName);
    return reqToPromise(idx.get(query));
  },
  async delete(storeName, key) {
    const store = await tx(storeName, 'readwrite');
    return reqToPromise(store.delete(key));
  },
  async clear(storeName) {
    const store = await tx(storeName, 'readwrite');
    return reqToPromise(store.clear());
  },
  async exportAll() {
    const stores = ['students', 'attendance', 'payments', 'progress', 'settings'];
    const data = {};
    for (const s of stores) {
      data[s] = await DB.getAll(s);
    }
    data.exportedAt = new Date().toISOString();
    return data;
  },
  async importAll(data, { replace = true } = {}) {
    const stores = ['students', 'attendance', 'payments', 'progress', 'settings'];
    const db = await openDB();
    const t = db.transaction(stores, 'readwrite');
    for (const s of stores) {
      const store = t.objectStore(s);
      if (replace) store.clear();
      if (Array.isArray(data[s])) {
        for (const row of data[s]) store.put(row);
      }
    }
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve(true);
      t.onerror = () => reject(t.error);
    });
  },
};
