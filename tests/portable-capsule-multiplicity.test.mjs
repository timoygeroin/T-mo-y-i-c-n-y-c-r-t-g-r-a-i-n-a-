import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';

// Independent count oracle: file identity is an object occurrence, not a content hash.
const source=fs.readFileSync(new URL('../surfaces/02/portable-capsule.js',import.meta.url),'utf8');
class NamedFile extends Blob {constructor(parts,name,options){super(parts,options);this.name=name}}
const engine=()=>{const window={crypto:webcrypto};vm.runInNewContext(source,{window,Blob,File:NamedFile,TextEncoder,TextDecoder,Uint8Array,DataView,Date,JSON});return window.MondayPortable};
const vault=()=>{
 const data=new Map();let seq=0;
 return {
  async list(){return [...data.values()].map(x=>x.meta)},
  async get(id){return data.get(id) ? {blob:data.get(id).blob}:null},
  async add(file,opts={}){const id='f'+(++seq);const meta={id,name:file.name,size:file.size,type:file.type,...(opts.archiveIdentity?{archiveIdentity:opts.archiveIdentity,importPending:true}:{})};data.set(id,{meta,blob:file});return meta},
  async remove(id){data.delete(id)},
  async finalizeImports(ids){for(const id of ids){const x=data.get(id);if(x)x.meta.importPending=false}},
  async digestList(){return Promise.all([...data.values()].map(async x=>({name:x.meta.name,sha256:createHash('sha256').update(Buffer.from(await x.blob.arrayBuffer())).digest('hex')})))},
  count(){return data.size}
 };
};
const state={schema:'monday.surface.local.v1',notes:[{id:'n',body:'preserve'}]};
const opts=v=>({vault:v,validateState:b=>b.data,commitState:async()=>true});
const f=(name,bytes)=>new NamedFile([new Uint8Array(bytes)],name,{type:'application/octet-stream'});

test('two independent identical-name-and-byte files survive as two distinct objects',async()=>{
 const e=engine(),src=vault(),dst=vault();
 await src.add(f('same.bin',[1,2,3]));await src.add(f('same.bin',[1,2,3]));
 const archive=(await e.exportCapsule({state,vault:src})).blob;
 const inspected=await e.inspectCapsule(archive);
 assert.equal(inspected.index.files.length,2);
 assert.equal(inspected.index.files[0].key,inspected.index.files[1].key);
 const result=await e.importCapsule(archive,opts(dst));
 assert.equal(result.filesAdded,2);assert.equal(dst.count(),2);
 assert.deepEqual(await dst.digestList(),await src.digestList());
});

test('partially restored duplicate multiset fills missing copies and replay is idempotent',async()=>{
 const e=engine(),src=vault(),dst=vault();
 for(let i=0;i<3;i++)await src.add(f('photo.heic',[9,9,9,9]));
 const archive=(await e.exportCapsule({state,vault:src})).blob;
 const key=(await e.inspectCapsule(archive)).index.files[0].key;
 await dst.add(f('photo.heic',[9,9,9,9]),{archiveIdentity:key});
 const first=await e.importCapsule(archive,opts(dst));
 assert.equal(first.filesAdded,2);assert.equal(first.filesSkipped,1);assert.equal(dst.count(),3);
 const second=await e.importCapsule(archive,opts(dst));
 assert.equal(second.filesAdded,0);assert.equal(second.filesSkipped,3);assert.equal(dst.count(),3);
});

test('zero-length duplicate objects are not silently collapsed',async()=>{
 const e=engine(),src=vault(),dst=vault();
 await src.add(f('empty.txt',[]));await src.add(f('empty.txt',[]));
 const archive=(await e.exportCapsule({state,vault:src})).blob;
 await e.importCapsule(archive,opts(dst));
 assert.equal(dst.count(),2);
});

test('120 seeded duplicate-multiset restorations match count oracle and replay',async()=>{
 const e=engine();let seed=20261023;
 const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed};
 for(let t=0;t<120;t++){
  const src=vault(),dst=vault(),counts=new Map(),existingCounts=new Map(),rows=[];
  const n=1+(rnd()%12);
  for(let j=0;j<n;j++){
   const type=rnd()%4;
   const name=['same.bin','photo.heic','same.bin','empty.dat'][type];
   const bytes=type===3?[]:type===0?[1,2]:type===1?[3,4,5]:[1,2];
   const id=name+':'+bytes.join(',');
   rows.push({id,name,bytes});counts.set(id,(counts.get(id)||0)+1);
   await src.add(f(name,bytes));
  }
  const archive=(await e.exportCapsule({state,vault:src})).blob;
  const index=(await e.inspectCapsule(archive)).index;
  for(let j=0;j<n;j++){
   const row=rows[j];if((rnd()%3)!==0)continue;
   await dst.add(f(row.name,row.bytes),{archiveIdentity:index.files[j].key});
   existingCounts.set(row.id,(existingCounts.get(row.id)||0)+1);
  }
  const expectedAdd=[...counts].reduce((sum,[id,num])=>sum+Math.max(0,num-(existingCounts.get(id)||0)),0);
  const before=dst.count();
  const first=await e.importCapsule(archive,opts(dst));
  assert.equal(first.filesAdded,expectedAdd,'case '+t);
  assert.equal(dst.count(),before+expectedAdd,'case '+t);
  const second=await e.importCapsule(archive,opts(dst));
  assert.equal(second.filesAdded,0,'replay case '+t);
  assert.equal(dst.count(),before+expectedAdd,'replay case '+t);
 }
});

test('corrupt pre-existing duplicate copy blocks state commit without deleting owner data',async()=>{
 const e=engine(),src=vault(),dst=vault();
 for(let i=0;i<2;i++)await src.add(f('same.bin',[7,8,9]));
 const archive=(await e.exportCapsule({state,vault:src})).blob;
 const key=(await e.inspectCapsule(archive)).index.files[0].key;
 await dst.add(f('same.bin',[7,8,9]),{archiveIdentity:key});
 await dst.add(f('same.bin',[7,8,0]),{archiveIdentity:key});
 let commits=0;
 await assert.rejects(e.importCapsule(archive,{...opts(dst),commitState:async()=>{commits++;return true}}),/EXISTING_FILE_INTEGRITY_FAILED/);
 assert.equal(commits,0);assert.equal(dst.count(),2);
});

test('failed state commit rolls back all newly imported duplicate copies',async()=>{
 const e=engine(),src=vault(),dst=vault();
 for(let i=0;i<4;i++)await src.add(f('repeat.dat',[4]));
 const archive=(await e.exportCapsule({state,vault:src})).blob;
 await assert.rejects(e.importCapsule(archive,{...opts(dst),commitState:async()=>false}),/STATE_COMMIT_FAILED/);
 assert.equal(dst.count(),0);
});
