import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const code=fs.readFileSync(new URL('../surfaces/02/encrypted-capsule.js',import.meta.url),'utf8');
function engine(){
 const window={crypto:webcrypto};
 vm.runInNewContext(code,{window,Blob,Uint8Array,DataView,TextEncoder,BigInt,Number,Math,Error});
 return window.MondayEncryptedCapsule;
}
test('AES-GCM encryption roundtrip over 2MB with bounded chunk buffers',async()=>{
 const e=engine(),pass='Correct horse battery staple «Monday» 2026';
 const original=new Blob([new Uint8Array(2*1048576+103).fill(97)]);
 const result=await e.encrypt(original,pass);
 assert.equal(result.blocks,3);
 assert.equal(await e.readSignature(result.blob),true);
 assert.equal(result.blob.size-original.size,44+3*16);
 const copy=await e.decrypt(result.blob,pass);
 assert.equal(copy.size,original.size);
 assert.deepEqual(new Uint8Array(await copy.arrayBuffer()),new Uint8Array(await original.arrayBuffer()));
});
test('wrong passphrase and tampering never yield partially decrypted restored data',async()=>{
 const e=engine(),pass='A sufficiently long passphrase 2026';
 const original=new Blob([new Uint8Array(1048600).fill(42)]);
 const wrapped=(await e.encrypt(original,pass)).blob;
 await assert.rejects(e.decrypt(wrapped,'Entirely different passphrase!'),/WRONG_PASSPHRASE_OR_TAMPERED_ARCHIVE/);
 const raw=new Uint8Array(await wrapped.arrayBuffer());raw[raw.length-1]^=1;
 await assert.rejects(e.decrypt(new Blob([raw]),pass),/WRONG_PASSPHRASE_OR_TAMPERED_ARCHIVE/);
});
test('malformed headers and missing bytes are rejected safely',async()=>{
 const e=engine(),pass='Twelve characters minimum passphrase';
 assert.equal(await e.readSignature(new Blob(['not encrypted'])),false);
 await assert.rejects(e.decrypt(new Blob(['plain']),pass),/NOT_ENCRYPTED_CAPSULE/);
 const archive=(await e.encrypt(new Blob(['secret file']),pass)).blob;
 await assert.rejects(e.decrypt(archive.slice(0,-4),pass),/ENCRYPTED_ARCHIVE_LENGTH_INVALID/);
 const extra=new Blob([archive,new Uint8Array([0])]);
 await assert.rejects(e.decrypt(extra,pass),/ENCRYPTED_ARCHIVE_LENGTH_INVALID/);
 const modified=new Uint8Array(await archive.arrayBuffer());modified[11]^=1;
 await assert.rejects(e.decrypt(new Blob([modified]),pass),/ENCRYPTED_VERSION_UNSUPPORTED/);
});
test('password length, API absence and empty archives',async()=>{
 const e=engine();
 await assert.rejects(e.encrypt(new Blob(['private']),'short'),/PASSPHRASE_LENGTH_INVALID/);
 const pass='minimum twelve chars';
 const zero=await e.encrypt(new Blob([]),pass);
 assert.equal((await e.decrypt(zero.blob,pass)).size,0);
 assert.equal(zero.blocks,1);
 await assert.rejects(e.decrypt(zero.blob,'a different long password 2026'),/WRONG_PASSPHRASE_OR_TAMPERED_ARCHIVE/);
 const window={crypto:{getRandomValues:x=>x}};
 vm.runInNewContext(code,{window,Blob,Uint8Array,DataView,TextEncoder,BigInt,Number,Math,Error});
 await assert.rejects(window.MondayEncryptedCapsule.encrypt(new Blob(['a']),pass),/CRYPTO_UNAVAILABLE/);
});
test('same plaintext, different random salt and nonce produces distinct ciphertext',async()=>{
 const e=engine(),blob=new Blob(['secret']),pass='strong and distinct passphrase';
 const a=(await e.encrypt(blob,pass)).blob,b=(await e.encrypt(blob,pass)).blob;
 assert.notDeepEqual(new Uint8Array(await a.arrayBuffer()),new Uint8Array(await b.arrayBuffer()));
});
