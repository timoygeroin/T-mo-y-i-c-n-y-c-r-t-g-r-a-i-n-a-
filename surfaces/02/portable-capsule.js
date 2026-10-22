/* Owner-controlled, plaintext, portable binary archive.
   No external dependencies or provider-specific storage. */
(function (root) {
  'use strict';
  const MAGIC = 'MONDAYCAPSULE1\n';
  const HEADER_SIZE = MAGIC.length + 4;
  const CHECKSUM_LENGTH = 64; // ASCII SHA-256 of the entire manifest (incl. notes and drafts).
  const CHUNK_SIZE = 2 * 1024 * 1024;
  const MAX_MANIFEST_BYTES = 16 * 1024 * 1024;
  const MAX_FILES = 2000;
  const SCHEMA = 'monday.portable.capsule.v1';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const isSafeInteger = n => Number.isSafeInteger(n) && n >= 0;
  const hash = async data => {
    if (!root.crypto?.subtle?.digest) throw Error('CRYPTO_UNAVAILABLE');
    const bytes = new Uint8Array(await root.crypto.subtle.digest('SHA-256', data));
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  };
  const assert = (condition, code) => { if (!condition) throw Error(code); };
  function validEntry(entry) {
    assert(entry && typeof entry === 'object' && !Array.isArray(entry), 'INVALID_FILE_ENTRY');
    assert(typeof entry.name === 'string' && entry.name.length > 0 && entry.name.length <= 255 &&
      !entry.name.includes('\0'), 'INVALID_FILE_NAME');
    assert(typeof entry.type === 'string' && entry.type.length <= 120, 'INVALID_FILE_TYPE');
    assert(isSafeInteger(entry.size), 'INVALID_FILE_SIZE');
    assert(Array.isArray(entry.chunks) &&
      entry.chunks.length === Math.ceil(entry.size / CHUNK_SIZE) &&
      entry.chunks.every(s => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s)), 'INVALID_FILE_HASHES');
    assert(typeof entry.key === 'string' && /^[0-9a-f]{64}$/.test(entry.key), 'INVALID_FILE_KEY');
  }
  async function keyFor(entry) {
    return hash(encoder.encode(JSON.stringify([entry.name,entry.type,entry.size,entry.chunks])));
  }
  async function chunkDigests(blob) {
    const chunks = [];
    for (let position = 0; position < blob.size; position += CHUNK_SIZE) {
      chunks.push(await hash(await blob.slice(position, position + CHUNK_SIZE).arrayBuffer()));
    }
    return chunks;
  }
  async function exportCapsule({state,vault}) {
    assert(state && typeof state === 'object' && !Array.isArray(state), 'INVALID_STATE');
    assert(vault && typeof vault.list === 'function' && typeof vault.get === 'function', 'VAULT_UNAVAILABLE');
    const records = await vault.list();
    assert(Array.isArray(records) && records.length <= MAX_FILES, 'FILE_COUNT_EXCEEDED');
    const files = [], parts = [], seen = new Set();
    for (const item of records) {
      assert(typeof item.id === 'string' && !seen.has(item.id), 'DUPLICATE_FILE_ID');
      seen.add(item.id);
      const stored = await vault.get(item.id);
      assert(stored?.blob && stored.blob.size === item.size, 'VAULT_READBACK_FAILED');
      const entry = {name:String(item.name),type:String(item.type||''),size:stored.blob.size,
        chunks:await chunkDigests(stored.blob)};
      entry.key = await keyFor(entry);
      validEntry(entry);
      files.push(entry);
      parts.push(stored.blob);
    }
    const index = {schema:SCHEMA,exportedAt:new Date().toISOString(),
      backup:{schema:'monday.surface.backup.v1',data:state},
      chunkBytes:CHUNK_SIZE,files};
    const manifest = encoder.encode(JSON.stringify(index));
    assert(manifest.length <= MAX_MANIFEST_BYTES,'MANIFEST_TOO_LARGE');
    const length = new Uint8Array(4);
    new DataView(length.buffer).setUint32(0, manifest.length, true);
    const manifestChecksum = await hash(manifest);
    const blob = new Blob([encoder.encode(MAGIC),length,manifest,encoder.encode(manifestChecksum),...parts],
      {type:'application/octet-stream'});
    return {blob,files:files.length,totalBytes:blob.size,version:SCHEMA};
  }
  async function inspectCapsule(file) {
    assert(file && typeof file.slice === 'function' && isSafeInteger(file.size) && file.size >= HEADER_SIZE,'INVALID_ARCHIVE');
    const header = new Uint8Array(await file.slice(0,HEADER_SIZE).arrayBuffer());
    for(let i=0;i<MAGIC.length;i++)assert(header[i]===MAGIC.charCodeAt(i),'INVALID_ARCHIVE_SIGNATURE');
    const length = new DataView(header.buffer).getUint32(MAGIC.length,true);
    assert(length>0&&length<=MAX_MANIFEST_BYTES&&HEADER_SIZE+length+CHECKSUM_LENGTH<=file.size,'INVALID_MANIFEST_LENGTH');
    let index;
    const rawManifest = await file.slice(HEADER_SIZE, HEADER_SIZE+length).arrayBuffer();
    const storedChecksum = decoder.decode(await file.slice(HEADER_SIZE+length, HEADER_SIZE+length+CHECKSUM_LENGTH).arrayBuffer());
    assert(/^[a-f0-9]{64}$/.test(storedChecksum) && storedChecksum===await hash(rawManifest),'ARCHIVE_MANIFEST_TAMPERED');
    try { index=JSON.parse(decoder.decode(rawManifest)); }
    catch { throw Error('INVALID_MANIFEST'); }
    assert(index?.schema===SCHEMA&&index.chunkBytes===CHUNK_SIZE&&Array.isArray(index.files)&&
      index.files.length<=MAX_FILES&&index.backup?.schema==='monday.surface.backup.v1'&&
      index.backup.data&&typeof index.backup.data==='object','INVALID_MANIFEST');
    let offset=HEADER_SIZE+length+CHECKSUM_LENGTH;
    for(const entry of index.files) {
      validEntry(entry);
      assert(await keyFor(entry)===entry.key,'INVALID_FILE_KEY');
      assert(Number.isSafeInteger(offset+entry.size)&&offset+entry.size<=file.size,'ARCHIVE_TRUNCATED');
      offset+=entry.size;
    }
    assert(offset===file.size,'ARCHIVE_TRAILING_BYTES');
    return {index,bodyOffset:HEADER_SIZE+length+CHECKSUM_LENGTH};
  }
  async function verifyCapsule(file, details) {
    let offset=details.bodyOffset;
    for(const entry of details.index.files){
      for(let i=0;i<entry.chunks.length;i++){
        const from=offset+i*CHUNK_SIZE,until=Math.min(offset+entry.size,from+CHUNK_SIZE);
        const observed=await hash(await file.slice(from,until).arrayBuffer());
        assert(observed===entry.chunks[i],'ARCHIVE_INTEGRITY_FAILED');
      }
      offset+=entry.size;
    }
    return true;
  }
  async function importCapsule(file,{vault,validateState,commitState}={}) {
    assert(vault&&typeof vault.list==='function'&&typeof vault.get==='function'&&typeof vault.add==='function'&&typeof vault.remove==='function','VAULT_UNAVAILABLE');
    assert(typeof validateState==='function'&&typeof commitState==='function','STATE_HANDLER_REQUIRED');
    const details=await inspectCapsule(file);
    const normalized=await validateState(details.index.backup);
    assert(normalized&&typeof normalized==='object','INVALID_BACKUP_STATE');
    // Nothing is written until EVERY content chunk is verified.
    await verifyCapsule(file,details);
    const existing = new Map((await vault.list()).filter(x=>typeof x.archiveIdentity==='string').map(x=>[x.archiveIdentity,x.id]));
    const added=[],skipped=[];
    let offset=details.bodyOffset;
    try {
      for(const entry of details.index.files){
        if(existing.has(entry.key)){
          // Identity metadata alone is not proof. Local files can be modified or evicted.
          const persisted=await vault.get(existing.get(entry.key));
          assert(persisted?.blob && persisted.blob.size===entry.size,'EXISTING_FILE_READBACK_FAILED');
          const observed=await chunkDigests(persisted.blob);
          assert(observed.length===entry.chunks.length && observed.every((h,i)=>h===entry.chunks[i]),
            'EXISTING_FILE_INTEGRITY_FAILED');
          skipped.push(entry.name);
        }
        else {
          const fragment=file.slice(offset,offset+entry.size,entry.type);
          const candidate=new File([fragment],entry.name,{type:entry.type});
          const meta=await vault.add(candidate,{archiveIdentity:entry.key});
          assert(meta?.id,'VAULT_IMPORT_FAILED');
          // Register rollback before reading back the stored bytes.
          added.push(meta.id);
          const persisted=await vault.get(meta.id);
          assert(persisted?.blob && persisted.blob.size===entry.size,'VAULT_RESTORED_READBACK_FAILED');
          const observed=await chunkDigests(persisted.blob);
          assert(observed.length===entry.chunks.length && observed.every((hash,i)=>hash===entry.chunks[i]),'VAULT_RESTORED_INTEGRITY_FAILED');
          existing.set(entry.key,meta.id);
        }
        offset+=entry.size;
      }
      assert(await commitState(normalized)===true,'STATE_COMMIT_FAILED');
      return {filesAdded:added.length,filesSkipped:skipped.length,stateRestored:true};
    } catch(error) {
      for(const id of added.reverse())try{await vault.remove(id)}catch{}
      throw error;
    }
  }
  root.MondayPortable = Object.freeze({exportCapsule,inspectCapsule,verifyCapsule,importCapsule});
})(window);
