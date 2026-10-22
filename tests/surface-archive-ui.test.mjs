import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const read=n=>fs.readFileSync(new URL('../surfaces/02/'+n,import.meta.url),'utf8');
class NamedFile extends Blob {constructor(parts,name,options){super(parts,options);this.name=name}}
const makeVault=()=>{
 const items=new Map();
 let counter=0;
 return {
   available:()=>true,
   list:async()=>[...items].map(([id,v])=>v.meta),
   get:async id=>items.has(id)?{blob:items.get(id).blob}:null,
   remove:async id=>{items.delete(id)},
   add:async (blob,opts={})=>{
     const id='f-'+(++counter);
     const meta={id,name:blob.name,size:blob.size,type:blob.type,archiveIdentity:opts.archiveIdentity};
     items.set(id,{blob,meta});return meta;
   }
 };
};
function boot(vault){
 const storage=new Map(),sessions=new Map(),urlMap=new Map(),downloads=[],listeners={};
 const node={innerHTML:''},notice={textContent:'',classList:{add(){},remove(){}}};
 const body={classList:{toggle(){},add(){},remove(){}},appendChild(){}};
 const window={location:{protocol:'file:',hash:'#/library'},crypto:webcrypto,
   confirm:()=>true,history:{pushState(){},replaceState(){}},scrollTo(){},addEventListener(){},
   MondayFiles:vault};
 let counter=0;
 const URL={createObjectURL:blob=>{const key='blob:test/'+(++counter);urlMap.set(key,blob);return key},revokeObjectURL(){}};
 const document={
  title:'',documentElement:{dataset:{}},body,
  querySelector:sel=>sel==='#app'?node:sel==='#notice'?notice:null,
  addEventListener:(event,callback)=>{listeners[event]=callback},
  createElement:tag=>{
    if(tag==='a')return {href:'',download:'',click(){downloads.push({name:this.download,blob:urlMap.get(this.href)})},remove(){}};
    return {remove(){},click(){}};
  }
 };
 const localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
 const sessionStorage={getItem:key=>sessions.get(key)||null,setItem:(key,value)=>sessions.set(key,String(value))};
 const context={window,document,URL,localStorage,sessionStorage,navigator:{},TextEncoder,TextDecoder,Blob,File:NamedFile,
   Uint8Array,DataView,JSON,Math,Date,crypto:webcrypto,structuredClone,
   matchMedia:()=>({matches:false}),setTimeout:()=>1,clearTimeout(){},console,Event};
 vm.createContext(context);
 vm.runInContext(read('portable-capsule.js'),context);
 const source=read('app.js');
 const script=source.replace(/\}\)\(\);\s*$/,
  'globalThis.__ui={getDb:()=>db,update,go,onDo,importCompleteArchive,exportCompleteArchive};})();');
 assert.notEqual(script,source);
 vm.runInContext(script,context,{timeout:3000});
 return {context,downloads,notice,node,listeners};
}
test('actual application handler exports owner notes AND a 3MiB file; second app restores them',async()=>{
 const original=makeVault(),first=boot(original);
 const file=new NamedFile([new Uint8Array(3*1024*1024+41).fill(37)],'full-photo.heic',{type:'image/heic'});
 await original.add(file);
 const updated=first.context.__ui.update(db=>{
   db.notes.push({id:'note-42',title:'Моя заметка',body:'Перенос настоящих файлов',
     createdAt:'2026-10-22T12:00:00.000Z',updatedAt:'2026-10-22T12:00:00.000Z'});
 },'note-saved','Local continuity');
 assert.equal(updated,true);
 await first.context.__ui.onDo('export-complete');
 assert.equal(first.downloads.length,1);
 const archive=first.downloads[0].blob;
 assert.equal(first.downloads[0].name.endsWith('.mondaycapsule'),true);
 assert.ok(archive.size>3*1024*1024);

 const target=makeVault(),second=boot(target);
 await second.context.__ui.importCompleteArchive(archive);
 assert.equal(second.context.__ui.getDb().notes.length,1);
 assert.equal(second.context.__ui.getDb().notes[0].body,'Перенос настоящих файлов');
 const restored=await target.list();
 assert.equal(restored.length,1);
 assert.equal(restored[0].name,'full-photo.heic');
 assert.equal((await target.get(restored[0].id)).blob.size,file.size);

 await second.context.__ui.importCompleteArchive(archive);
 assert.equal((await target.list()).length,1,'never duplicate imported files');
 assert.equal(second.context.__ui.getDb().notes.length,1,'never duplicate imported notes');
});

test('UI refuses corrupted archive with no state or file changes',async()=>{
 const first=boot(makeVault());
 await first.context.__ui.onDo('export-complete');
 const clean=first.downloads[0].blob;
 const tampered=new Uint8Array(await clean.arrayBuffer());
 tampered[tampered.length-8]^=1;
 const second=boot(makeVault());
 await second.context.__ui.importCompleteArchive(new Blob([tampered]));
 assert.match(second.notice.textContent,/Архив не восстановлен/);
 assert.equal(second.context.__ui.getDb().notes.length,0);
});

test('both user-facing pages advertise full capsule actions without replacing JSON backup',()=>{
 const app=read('app.js'),html=read('index.html');
 assert.match(html,/id="portablePicker"/);
 assert.match(app,/Скачать JSON без файлов/);
 assert.match(app,/Экспорт со всеми файлами/);
 assert.match(app,/Восстановить полный архив/);
 assert.match(app,/Архив.*не зашифрован/);
});
