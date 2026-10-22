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
   pendingImports:async()=>[...items.values()].map(x=>x.meta).filter(x=>x.importPending),
   finalizeImports:async ids=>{for(const id of ids){const v=items.get(id);if(v)v.meta.importPending=false;}},
   add:async (blob,opts={})=>{
     const id='f-'+(++counter);
     const meta={id,name:blob.name,size:blob.size,type:blob.type,archiveIdentity:opts.archiveIdentity,importPending:!!opts.archiveIdentity};
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
 class FormData {constructor(form){this.form=form} entries(){return Object.entries(this.form.fields||{})}}
 const context={window,document,URL,localStorage,sessionStorage,FormData,navigator:{},TextEncoder,TextDecoder,Blob,File:NamedFile,
   Uint8Array,DataView,JSON,Math,Date,crypto:webcrypto,structuredClone,
   matchMedia:()=>({matches:false}),setTimeout:()=>1,clearTimeout(){},console,Event};
 vm.createContext(context);
 vm.runInContext(read('portable-capsule.js'),context);
 vm.runInContext(read('encrypted-capsule.js'),context);
 const source=read('app.js');
 const script=source.replace(/\}\)\(\);\s*$/,
  'globalThis.__ui={getDb:()=>db,update,go,onDo,importCompleteArchive,exportCompleteArchive,modalSubmit,setModalAction:x=>{modalAction=x},setPendingEncryptedFile:x=>{pendingEncryptedFile=x}};})();');
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



test('actual Monday UI exports encrypted binary capsule and restores after owner passphrase',async()=>{
 const source=makeVault(),first=boot(source),pass='A long private Monday passphrase 2026!';
 const original=new NamedFile([new Uint8Array(1111111).fill(71)],'private-photo.heic',{type:'image/heic'});
 await source.add(original);
 first.context.__ui.update(db=>db.notes.push({
   id:'secure-note',title:'Secret',body:'Private contents',createdAt:'2026-10-22T00:00:00Z',updatedAt:'2026-10-22T00:00:00Z'
 }),'note','note');
 await first.context.__ui.exportCompleteArchive(pass);
 assert.equal(first.downloads.length,1);
 assert.match(first.downloads[0].name,/\.mondaysecure$/);
 const encrypted=first.downloads[0].blob;
 const engine=first.context.window.MondayEncryptedCapsule;
 assert.equal(await engine.readSignature(encrypted),true);
 await assert.rejects(engine.decrypt(encrypted,'Incorrect but long passphrase'),/WRONG_PASSPHRASE_OR_TAMPERED_ARCHIVE/);
 const target=makeVault(),second=boot(target);
 const clear=await second.context.window.MondayEncryptedCapsule.decrypt(encrypted,pass);
 await second.context.__ui.importCompleteArchive(clear,true);
 assert.equal(second.context.__ui.getDb().notes[0].body,'Private contents');
 const entries=await target.list();
 assert.equal(entries.length,1);
 assert.equal((await target.get(entries[0].id)).blob.size,original.size);
});


test('secure modal refuses mismatched passwords without creating archive',async()=>{
 const ui=boot(makeVault());
 ui.context.__ui.setModalAction('secure-export');
 ui.context.__ui.modalSubmit({fields:{password:'long secure password number one',repeat:'different long secure password'}});
 assert.equal(ui.downloads.length,0);
 assert.match(ui.notice.textContent,/Пароли не совпадают/);
});

test('secure password form creates encrypted archive without saving password in app state',async()=>{
 const ui=boot(makeVault()),pass='lengthy custom secret passphrase';
 ui.context.__ui.setModalAction('secure-export');
 ui.context.__ui.modalSubmit({fields:{password:pass,repeat:pass}});
 for(let i=0;i<50&&ui.downloads.length===0;i++)await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(ui.downloads.length,1);
 assert.match(ui.downloads[0].name,/\.mondaysecure$/);
 assert.equal(await ui.context.window.MondayEncryptedCapsule.readSignature(ui.downloads[0].blob),true);
 assert.ok(!JSON.stringify(ui.context.__ui.getDb()).includes(pass));
});

test('secure import modal with wrong password never modifies imported state',async()=>{
 const source=boot(makeVault()),pass='lengthy valid secret for archive';
 await source.context.__ui.exportCompleteArchive(pass);
 const blob=source.downloads[0].blob;
 const target=boot(makeVault());
 target.context.__ui.setPendingEncryptedFile(blob);
 target.context.__ui.setModalAction('secure-import');
 target.context.__ui.modalSubmit({fields:{password:'another long wrong password'}});
 for(let i=0;i<30&&!target.notice.textContent.includes('Расшифровка не выполнена');i++)
   await new Promise(resolve=>setTimeout(resolve,20));
 assert.match(target.notice.textContent,/Расшифровка не выполнена/);
 assert.equal(target.context.__ui.getDb().notes.length,0);
 assert.equal((await target.context.window.MondayFiles.list()).length,0);
});

test('both user-facing pages advertise full capsule actions without replacing JSON backup',()=>{
 const app=read('app.js'),html=read('index.html');
 assert.match(html,/id="portablePicker"/);
 assert.match(app,/Скачать JSON без файлов/);
 assert.match(app,/Защищённый архив со всеми файлами/);
 assert.match(app,/Восстановить полный архив/);
 assert.match(app,/Защищённый архив|Незашифрованный архив/);
});
