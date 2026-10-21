const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/app.js','utf8');
const local=new Map(),session=new Map();
const localStorage={getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,String(v)),removeItem:k=>local.delete(k)};
const sessionStorage={getItem:k=>session.get(k)??null,setItem:(k,v)=>session.set(k,String(v))};
function boot(){
 const callbacks={},app={innerHTML:'',classList:{toggle(){},add(){},remove(){}}},notice={textContent:'',classList:{toggle(){},add(){},remove(){}}};
 const doc={title:'',documentElement:{dataset:{}},body:{classList:{toggle(){},add(){},remove(){}}},
 querySelector(s){return s==='#app'?app:s==='#notice'?notice:null},addEventListener(k,f){callbacks[k]=f},createElement(){return {}}};
 const window={addEventListener(){},scrollTo(){},location:{protocol:'file:'}};
 const ctx={document:doc,window,localStorage,sessionStorage,navigator:{},crypto:globalThis.crypto,matchMedia:()=>({matches:false}),structuredClone,Date,JSON,Math,console,setTimeout:()=>1,clearTimeout(){},Event};
 vm.createContext(ctx);
 const hooked=source.replace(/\}\)\(\);\s*$/,'globalThis.__qa={getDb:()=>db,getView:()=>view,getThread:()=>threadId,threadDraft,newThread,go,onDo,update,importBackup};})();');
 assert.notEqual(hooked,source,'QA hook must attach to app IIFE');
 vm.runInContext(hooked,ctx,{timeout:3000});
 return {...ctx.__qa,callbacks,app,notice};
}
const a=boot();
a.newThread('Первый диалог');
const idA=a.getThread();a.callbacks.input({target:{id:'chatDraft',value:'Неотправленный текст А'}});
a.go('home');a.newThread('Второй диалог');
const idB=a.getThread();a.callbacks.input({target:{id:'chatDraft',value:'Неотправленный текст Б'}});
assert.notEqual(idA,idB);
a.go('thread',idA);
assert.ok(a.app.innerHTML.includes('Неотправленный текст А'));
assert.ok(!a.app.innerHTML.includes('Неотправленный текст Б'));
const b=boot(); // simulate refresh within same browser tab
assert.equal(b.getView(),'thread');
assert.equal(b.getThread(),idA);
assert.equal(b.threadDraft(idA),'Неотправленный текст А');
assert.equal(b.threadDraft(idB),'Неотправленный текст Б');
const backup=JSON.parse(local.get('monday.surface.local.v1'));
const imported=b.importBackup({schema:'monday.surface.backup.v1',data:backup});
assert.equal(imported.drafts.byThread[idA],'Неотправленный текст А');
assert.equal(imported.drafts.byThread[idB],'Неотправленный текст Б');
b.update(d=>{delete d.drafts.byThread[idA]},'message','Сообщение А сохранено');
assert.equal(b.threadDraft(idA),'');
assert.equal(b.threadDraft(idB),'Неотправленный текст Б');
b.update(d=>{d.drafts.chat='Непривязанный старый черновик'},'test','legacy');
b.go('thread',idA);
assert.ok(b.app.innerHTML.includes('Восстановить неприкреплённый черновик'));
b.onDo('recover-legacy-draft');
assert.equal(b.threadDraft(idA),'Непривязанный старый черновик');
assert.equal(b.threadDraft(idB),'Неотправленный текст Б');
assert.equal(b.getDb().drafts.chat,'');
console.log('PASS: exact tab resume, isolated drafts, safe migration, portable backup does not drop unfinished work');
