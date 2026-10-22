import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=n=>fs.readFileSync(new URL('../surfaces/02/'+n,import.meta.url),'utf8');
function boot(){
 const app={innerHTML:''},notice={textContent:'',classList:{add(){},remove(){}}};
 const store=new Map(),session=new Map();let deny=false;
 const localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>{if(deny)throw Error('quota');store.set(k,String(v))},removeItem:k=>store.delete(k)};
 const sessionStorage={getItem:k=>session.get(k)||null,setItem:(k,v)=>session.set(k,String(v))};
 const window={location:{hash:'',protocol:'file:'},scrollTo(){},addEventListener(){},history:{pushState(){},replaceState(){}}};
 const document={title:'',documentElement:{dataset:{}},body:{classList:{add(){},remove(){},toggle(){}}},querySelector:s=>s==='#app'?app:s==='#notice'?notice:null,addEventListener(){},createElement(){return {}}};
 const context={window,document,localStorage,sessionStorage,navigator:{},crypto:globalThis.crypto,structuredClone,Date,JSON,Math,console,setTimeout:()=>1,clearTimeout(){},matchMedia:()=>({matches:false}),Event};
 vm.createContext(context);vm.runInContext(read('local-actions.js'),context);
 const source=read('app.js'),instrumented=source.replace(/\}\)\(\);\s*$/,'globalThis.__ui={newThread,processLocalCommand,go,importBackup,applyImported,getDb:()=>db};})();');
 assert.notEqual(source,instrumented);vm.runInContext(instrumented,context,{timeout:4000});
 return {context,app,notice,store,denyWrites:()=>{deny=true}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('real Home command writes memory, readback receipt, and renders it on Home',async()=>{
 const x=boot();x.context.__ui.newThread('запомни: Продолжение важнее начала');
 await flush();await flush();
 const db=x.context.__ui.getDb(),disk=JSON.parse(x.store.get('monday.surface.local.v1'));
 assert.equal(db.localBrain.corrections[0].status,'active');
 assert.equal(disk.localBrain.corrections[0].rule,'Продолжение важнее начала');
 assert.equal(db.localBrain.receipts[0].verified,false);
 assert.equal(db.threads[0].messages.length,2);
 assert.match(db.threads[0].messages[1].text,/Повторное чтение устройства/);
 x.context.__ui.go('home');assert.match(x.app.innerHTML,/Продолжение важнее начала/);
});
test('local task and focus are visible in existing Work and Home',async()=>{
 const x=boot();x.context.__ui.newThread('добавь задачу: Проверить MondayID на iPhone');
 await flush();await flush();
 const id=x.context.__ui.getDb().threads[0].id;
 assert.equal((await x.context.__ui.processLocalCommand('главная цель: Одна Monday',id)).ok,true);
 x.context.__ui.go('work');assert.match(x.app.innerHTML,/Проверить MondayID на iPhone/);
 x.context.__ui.go('home');assert.match(x.app.innerHTML,/Одна Monday/);
});
test('ordinary text does not invent model answer and repeated action is idempotent',async()=>{
 const x=boot();x.context.__ui.newThread('Привет, Monday');await flush();
 assert.equal(x.context.__ui.getDb().threads[0].messages.length,1);
 const id=x.context.__ui.getDb().threads[0].id;
 assert.equal((await x.context.__ui.processLocalCommand('/task Test local',id)).ok,true);
 const duplicate=await x.context.__ui.processLocalCommand('/task Test local',id);
 assert.equal(duplicate.code,'LOCAL_DUPLICATE');
 assert.equal(x.context.__ui.getDb().localBrain.tasks.length,1);
});
test('failed write never creates a verified receipt',async()=>{
 const x=boot();x.context.__ui.newThread('Привет');x.denyWrites();
 const id=x.context.__ui.getDb().threads[0].id;
 const r=await x.context.__ui.processLocalCommand('/remember Save continuity',id);
 assert.equal(r.code,'LOCAL_WRITE_FAILED');
 assert.equal(x.context.__ui.getDb().localBrain.receipts.length,0);
});
test('imported memory is restored but claimed external verification is discarded',async()=>{
 const x=boot();x.context.__ui.newThread('/remember One organism');await flush();await flush();
 const saved=structuredClone(x.context.__ui.getDb());saved.localBrain.receipts[0].verified=true;saved.localBrain.receipts[0].kind='system';
 const clean=x.context.__ui.importBackup({schema:'monday.surface.backup.v1',data:saved});
 assert.equal(clean.localBrain.receipts[0].verified,false);
 assert.equal(clean.localBrain.receipts[0].kind,'owner');
 const y=boot();y.context.__ui.applyImported(clean);y.context.__ui.applyImported(clean);
 assert.equal(y.context.__ui.getDb().localBrain.corrections.length,1);
});
