/* MondayID encrypted portable capsule v1: PBKDF2 + bounded AES-GCM chunks.
   Runs only locally. Never persists the passphrase. Original .mondaycapsule remains readable. */
(function(root) {
 'use strict';
 const MAGIC='MONDAYENC1\n', VERSION=1, BLOCK=1048576, TAG=16, SALT=16, PREFIX=8, HEADER=MAGIC.length+1+SALT+PREFIX+8, ITERATIONS=310000;
 const enc=new TextEncoder(), err=code=>{throw Error(code)};
 const uint8=async(blob)=>new Uint8Array(await blob.arrayBuffer());
 const subtle=()=>root.crypto?.subtle||err('CRYPTO_UNAVAILABLE');
 const ensurePass=(p)=>{if(typeof p!=='string'||p.length<12||p.length>1024)err('PASSPHRASE_LENGTH_INVALID')};
 const nonce=(prefix,index)=>{const b=new Uint8Array(12);b.set(prefix);new DataView(b.buffer).setUint32(8,index,false);return b};
 async function key(pass,salt) {
  ensurePass(pass);
  const crypto=subtle();
  const material=await crypto.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveKey']);
  return crypto.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},material,
    {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 }
 function matches(blob){
  if(!blob||typeof blob.slice!=='function')return false;
  return true; // detection requires readSignature
 }
 async function readSignature(blob){
  if(!matches(blob)||blob.size<MAGIC.length)return false;
  const bytes=await uint8(blob.slice(0,MAGIC.length));
  return bytes.every((b,i)=>b===MAGIC.charCodeAt(i));
 }
 async function encrypt(blob,pass){
  if(!blob||typeof blob.slice!=='function'||!Number.isSafeInteger(blob.size))err('INVALID_SOURCE');
  ensurePass(pass);
  const salt=root.crypto.getRandomValues(new Uint8Array(SALT));
  const prefix=root.crypto.getRandomValues(new Uint8Array(PREFIX));
  const count=Math.ceil(blob.size/BLOCK);
  if(count>0xffffffff)err('ARCHIVE_TOO_LARGE');
  const header=new Uint8Array(HEADER);
  header.set(enc.encode(MAGIC));header[MAGIC.length]=VERSION;
  header.set(salt,MAGIC.length+1);header.set(prefix,MAGIC.length+1+SALT);
  new DataView(header.buffer).setBigUint64(HEADER-8,BigInt(blob.size),false);
  const secret=await key(pass,salt),parts=[header];
  for(let i=0;i<count;i++){
    const plaintext=await blob.slice(i*BLOCK,Math.min(blob.size,(i+1)*BLOCK)).arrayBuffer();
    const ciphertext=await subtle().encrypt({name:'AES-GCM',iv:nonce(prefix,i),additionalData:header,tagLength:128},secret,plaintext);
    parts.push(ciphertext);
  }
  return {blob:new Blob(parts,{type:'application/octet-stream'}),blocks:count,encrypted:true};
 }
 async function decrypt(blob,pass){
  ensurePass(pass);
  if(!await readSignature(blob))err('NOT_ENCRYPTED_CAPSULE');
  if(blob.size<HEADER)err('ENCRYPTED_ARCHIVE_TRUNCATED');
  const header=await uint8(blob.slice(0,HEADER));
  if(header[MAGIC.length]!==VERSION)err('ENCRYPTED_VERSION_UNSUPPORTED');
  const salt=header.slice(MAGIC.length+1,MAGIC.length+1+SALT),
   prefix=header.slice(MAGIC.length+1+SALT,HEADER-8);
  const originalLength=new DataView(header.buffer).getBigUint64(HEADER-8,false);
  if(originalLength>BigInt(Number.MAX_SAFE_INTEGER))err('ARCHIVE_TOO_LARGE');
  const length=Number(originalLength),count=Math.ceil(length/BLOCK);
  if(count>0xffffffff)err('ARCHIVE_TOO_LARGE');
  const expected=HEADER+length+count*TAG;
  if(blob.size!==expected)err('ENCRYPTED_ARCHIVE_LENGTH_INVALID');
  const secret=await key(pass,salt),parts=[];
  for(let i=0;i<count;i++){
    const begin=HEADER+i*(BLOCK+TAG);
    const bytes=Math.min(BLOCK,length-i*BLOCK)+TAG;
    let clear;
    try{
      clear=await subtle().decrypt({name:'AES-GCM',iv:nonce(prefix,i),additionalData:header,tagLength:128},
        secret,await blob.slice(begin,begin+bytes).arrayBuffer());
    }catch{err('WRONG_PASSPHRASE_OR_TAMPERED_ARCHIVE')}
    parts.push(clear);
  }
  return new Blob(parts,{type:'application/octet-stream'});
 }
 root.MondayEncryptedCapsule=Object.freeze({encrypt,decrypt,readSignature});
})(window);
