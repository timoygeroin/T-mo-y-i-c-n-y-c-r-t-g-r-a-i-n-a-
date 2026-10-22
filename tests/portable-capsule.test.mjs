import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const source=fs.readFileSync(new URL('../surfaces/02/portable-capsule.js',import.meta.url),'utf8');
class NamedFile extends Blob {
 constructor(parts,name,options){super(parts,options);this.name=name}
}
function getPortable(){
 const context={window:{crypto:webcrypto},TextEncoder,TextDecoder,Blob,File:NamedFile,DataView,Uint8Array,Date,JSON};
 vm.runInNewContext(source,context);
 return context.window.MondayPortable;
}
function mockVault(){
 const entries=new Map();
 let index=0,puts=0,deletes=0;
 return {
  list:async()=>[...entries.values()].map(x=>x.meta),
  get:async(id)=>{const e=entries.get(id);return e?{blob:e.blob}:null},
  add:async(file,options={})=>{
   puts++;
   const id='local-'+(++index);
   const meta={id,name:file.name,size:file.size,type:file.type,archiveIdentity:options.archiveIdentity};
   entries.set(id,{blob:file,meta});return meta;
  },
  remove:async(id)=>{deletes++;entries.delete(id)},
  counts:()=>({puts,deletes,current:entries.size})
 };
}
const state=()=>({schema:'monday.surface.local.v1',version:1,notes:[{id:'x',title:'мой план',body:'важная запись'}],
 threads:[{id:'t1',title:'память',messages:[{text:'без облака'}]}],goals:[],spaces:[],events:[],
 prefs:{theme:'dark',quiet:false},activeGoal:null,drafts:{home:'draft',chat:'',byThread:{}}});
const file=(name,size,fill=34)=>new NamedFile([new Uint8Array(size).fill(fill)],name,{type:'application/octet-stream'});

test('a 5 MiB binary file and local state round-trip without base64 or outside network',async()=>{
 const portable=getPortable(),sourceVault=mockVault();
 await sourceVault.add(file('video-архив.mov',5*1024*1024+15));
 const {blob,files,totalBytes}=await portable.exportCapsule({state:state(),vault:sourceVault});
 assert.equal(files,1);assert.equal(totalBytes,blob.size);assert.ok(blob.size>5*1024*1024);
 const details=await portable.inspectCapsule(blob);
 assert.equal(details.index.backup.data.notes[0].body,'важная запись');
 assert.equal(details.index.files[0].chunks.length,3,'chunked hashing with bounded individual buffers');
 assert.equal(await portable.verifyCapsule(blob,details),true);
 const target=mockVault();let committed;
 const result=await portable.importCapsule(blob,{vault:target,
   validateState:b=>b.data,commitState:async s=>{committed=s;return true}});
 assert.equal(result.filesAdded,1);assert.equal(target.counts().current,1);
 assert.equal(committed.drafts.home,'draft');
 assert.equal((await target.list())[0].name,'video-архив.mov');
 assert.equal((await target.get((await target.list())[0].id)).blob.size,5*1024*1024+15);
});

test('reimporting the same archive skips binary duplicates and still accepts state',async()=>{
 const portable=getPortable(),origin=mockVault(),destination=mockVault();
 await origin.add(file('local.pdf',734),{});
 const archive=(await portable.exportCapsule({state:state(),vault:origin})).blob;
 let updates=0;
 const opts={vault:destination,validateState:b=>b.data,commitState:async()=>{updates++;return true}};
 const first=await portable.importCapsule(archive,opts);
 const second=await portable.importCapsule(archive,opts);
 assert.equal(first.filesAdded,1);assert.equal(second.filesAdded,0);
 assert.equal(second.filesSkipped,1);assert.equal(destination.counts().current,1);
 assert.equal(updates,2);
});

test('corrupted notes and drafts inside the manifest cannot restore as valid state',async()=>{
 const portable=getPortable(),sourceVault=mockVault(),destination=mockVault();
 const archive=(await portable.exportCapsule({state:state(),vault:sourceVault})).blob;
 const bytes=new Uint8Array(await archive.arrayBuffer());
 const needle=new TextEncoder().encode('важная запись');
 let at=-1;
 for(let i=0;i<bytes.length-needle.length;i++){
   if(needle.every((value,j)=>bytes[i+j]===value)){at=i;break}
 }
 assert.ok(at>0,'state text present in manifest');
 bytes[at] ^= 1;
 let stateTouched=false;
 await assert.rejects(portable.importCapsule(new Blob([bytes]),{vault:destination,
   validateState:b=>b.data,commitState:async()=>{stateTouched=true;return true}
 }),/ARCHIVE_MANIFEST_TAMPERED/);
 assert.equal(stateTouched,false);
 assert.equal(destination.counts().current,0);
});

test('a tampered file fails before writing any state or files',async()=>{
 const portable=getPortable(),vault=mockVault(),destination=mockVault();
 await vault.add(file('private.jpg',1024,9));
 const archive=(await portable.exportCapsule({state:state(),vault})).blob;
 const parts=[archive.slice(0,archive.size-1),new Uint8Array([31])];
 const corrupted=new Blob(parts);
 let touched=false;
 await assert.rejects(portable.importCapsule(corrupted,{
   vault:destination,validateState:b=>b.data,commitState:async()=>{touched=true;return true}
 }),/ARCHIVE_INTEGRITY_FAILED/);
 assert.equal(destination.counts().puts,0);
 assert.equal(touched,false);
});

test('truncation, extra bytes and fake signatures are refused',async()=>{
 const portable=getPortable(),sourceVault=mockVault(),target=mockVault();
 await sourceVault.add(file('x.bin',100));
 const original=(await portable.exportCapsule({state:state(),vault:sourceVault})).blob;
 for(const broken of [original.slice(0,original.size-10),new Blob([original,new Uint8Array([1])]),
   new Blob([new Uint8Array([1]),original.slice(1)])]){
  await assert.rejects(portable.importCapsule(broken,{vault:target,validateState:b=>b.data,commitState:async()=>true}),
    /ARCHIVE_TRUNCATED|ARCHIVE_TRAILING_BYTES|INVALID_ARCHIVE_SIGNATURE/);
 }
 assert.equal(target.counts().puts,0);
});

test('a state write failure rolls back newly imported binary attachments',async()=>{
 const portable=getPortable(),vault=mockVault(),target=mockVault();
 await vault.add(file('x.bin',10));
 await vault.add(file('y.bin',50));
 const archive=(await portable.exportCapsule({state:state(),vault})).blob;
 await assert.rejects(portable.importCapsule(archive,{vault:target,validateState:b=>b.data,
  commitState:async()=>false}),/STATE_COMMIT_FAILED/);
 assert.equal(target.counts().current,0);
 assert.equal(target.counts().deletes,2);
});

test('unsupported local crypto fails closed before a misleading archive is offered',async()=>{
 const context={window:{},TextEncoder,TextDecoder,Blob,File:NamedFile,DataView,Uint8Array,Date,JSON};
 vm.runInNewContext(source,context);
 const vault=mockVault();await vault.add(file('x',128));
 await assert.rejects(context.window.MondayPortable.exportCapsule({state:state(),vault}),/CRYPTO_UNAVAILABLE/);
});

test('PWA loads portable module before app, exposes picker, and updates cache',()=>{
 const read=n=>fs.readFileSync(new URL('../surfaces/02/'+n,import.meta.url),'utf8');
 const html=read('index.html'),sw=read('sw.js'),app=read('app.js');
 assert.ok(html.indexOf('portable-capsule.js')<html.indexOf('app.js'));
 assert.match(html,/id="portablePicker"/);
 assert.match(sw,/portable-capsule\.js/);
 assert.match(app,/function exportCompleteArchive\(\)/);
 assert.match(app,/function importCompleteArchive\(file\)/);
 assert.match(app,/Архив.*не зашифрован|Архив НЕ зашифрован/);
});
