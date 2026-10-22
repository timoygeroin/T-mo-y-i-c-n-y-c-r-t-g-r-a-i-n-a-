/* Browser-local binary vault. This is not cloud storage, encryption or cross-device sync. */
(function (root) {
  'use strict';
  const DATABASE = 'monday.surface.files.v1';
  const METADATA = 'metadata';
  const BLOBS = 'blobs';
  function available() { return typeof indexedDB !== 'undefined' && indexedDB !== null; }
  function open() {
    return new Promise((resolve, reject) => {
      if (!available()) return reject(new Error('Файловое хранилище недоступно в этом браузере'));
      let request;
      try { request = indexedDB.open(DATABASE, 1); }
      catch (e) { reject(e); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(METADATA)) db.createObjectStore(METADATA, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Не удалось открыть локальные файлы'));
      request.onblocked = () => reject(new Error('Закрой другие вкладки Monday, чтобы обновить хранилище'));
    });
  }
  async function transact(stores, mode, operation) {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        let tx;
        try { tx = db.transaction(stores, mode); } catch (e) { reject(e); return; }
        let output;
        tx.oncomplete = () => resolve(output);
        tx.onabort = () => reject(tx.error || new Error('Операция с файлами отменена'));
        tx.onerror = () => reject(tx.error || new Error('Ошибка сохранения файла'));
        try { operation(tx, value => { output = value; }); }
        catch (e) { try { tx.abort(); } catch {} reject(e); }
      });
    } finally { db.close(); }
  }
  async function add(file, options = {}) {
    if (!file || typeof file.size !== 'number' || typeof file.name !== 'string')
      throw new Error('Выбери файл для загрузки');
    const id = (root.crypto && root.crypto.randomUUID)
      ? root.crypto.randomUUID() : 'file-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const identity = options.archiveIdentity;
    if (identity !== undefined && (typeof identity !== 'string' || !/^[0-9a-f]{64}$/.test(identity)))
      throw new Error('Некорректный идентификатор переносимого архива');
    const meta = { id, name: file.name.slice(0, 255), size: file.size,
      type: String(file.type || 'application/octet-stream').slice(0, 120),
      addedAt: new Date().toISOString(), ...(identity ? {archiveIdentity: identity, importPending: true} : {}) };
    // Blob is stored by the browser without base64 or JSON duplication.
    await transact([METADATA, BLOBS], 'readwrite', tx => {
      tx.objectStore(METADATA).put(meta);
      tx.objectStore(BLOBS).put({ id, blob: file });
    });
    const saved = await get(id);
    if (!saved || saved.blob?.size !== file.size)
      throw new Error('Не удалось подтвердить сохранение файла');
    return meta;
  }
  async function list() {
    const records = await transact([METADATA], 'readonly', (tx, done) => {
      const req = tx.objectStore(METADATA).getAll();
      req.onsuccess = () => done(req.result || []);
    });
    return records.sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
  }
  function get(id) {
    return transact([BLOBS], 'readonly', (tx, done) => {
      const req = tx.objectStore(BLOBS).get(String(id));
      req.onsuccess = () => done(req.result || null);
    });
  }
  async function pendingImports() {
    return (await list()).filter(meta => meta.importPending === true);
  }
  async function finalizeImports(ids) {
    if (!Array.isArray(ids) || !ids.every(id=>typeof id==='string')) throw Error('INVALID_IMPORT_IDS');
    if (!ids.length) return;
    // All markers are committed atomically in one IndexedDB transaction.
    await transact([METADATA], 'readwrite', (tx) => {
      const store = tx.objectStore(METADATA);
      for(const id of new Set(ids)) {
        const req=store.get(id);
        req.onsuccess=()=>{
          if (!req.result || req.result.importPending!==true) return;
          const updated={...req.result,importPending:false};
          store.put(updated);
        };
      }
    });
    const remaining=new Set((await pendingImports()).map(item=>item.id));
    if (ids.some(id=>remaining.has(id))) throw Error('IMPORT_FINALIZATION_NOT_CONFIRMED');
  }
  function remove(id) {
    return transact([METADATA, BLOBS], 'readwrite', tx => {
      tx.objectStore(METADATA).delete(String(id));
      tx.objectStore(BLOBS).delete(String(id));
    });
  }
  root.MondayFiles = Object.freeze({ available, add, list, get, remove, pendingImports, finalizeImports });
})(window);
