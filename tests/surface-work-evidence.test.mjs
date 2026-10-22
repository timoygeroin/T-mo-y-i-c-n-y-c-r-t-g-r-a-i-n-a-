import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL('../surfaces/02/'+name, import.meta.url),'utf8');

function start({fetchImpl}={}){
 const node={innerHTML:''},notice={textContent:'',classList:{add(){},remove(){}}};
 const workBody={innerHTML:''};
 const local=new Map(),session=new Map();
 const window={location:{hash:'',protocol:'file:'},scrollTo(){},addEventListener(){},
   history:{pushState(){},replaceState(){}}};
 if(fetchImpl)window.fetch=fetchImpl;
 const document={title:'',documentElement:{dataset:{}},
   body:{classList:{toggle(){},add(){},remove(){}}},
   querySelector(sel){
     if(sel==='#app')return node;
     if(sel==='#notice')return notice;
     if(sel==='#workEvidenceBody'&&node.innerHTML.includes('id="workEvidenceBody"'))return workBody;
     return null;
   },addEventListener(){},createElement(){return {}}};
 const localStorage={getItem:key=>local.get(key)||null,setItem:(key,v)=>local.set(key,String(v)),removeItem:key=>local.delete(key)};
 const sessionStorage={getItem:key=>session.get(key)||null,setItem:(key,v)=>session.set(key,String(v))};
 const context={window,document,localStorage,sessionStorage,navigator:{},crypto:globalThis.crypto,
   structuredClone,Date,JSON,Math,console,setTimeout:()=>1,clearTimeout(){},matchMedia:()=>({matches:false}),Event};
 vm.createContext(context);
 vm.runInContext(read('work-evidence.js'),context);
 const src=read('app.js'),instrumented=src.replace(/\}\)\(\);\s*$/,
    'globalThis.__work={go,work,getView:()=>view,refreshWorkProof,workProofHtml,getDb:()=>db};})();');
 assert.notEqual(src,instrumented);
 vm.runInContext(instrumented,context,{timeout:3000});
 return {context,node,workBody};
}

test('Work is a distinct premium screen on iPhone and old goals still exist',()=>{
 const {context,node}=start();
 context.__work.go('work');
 assert.match(node.innerHTML,/Работу должно/);
 assert.match(node.innerHTML,/work-stage/);
 assert.match(node.innerHTML,/work-proof-list/);
 assert.match(node.innerHTML,/data-do="newgoal"/);
 assert.match(node.innerHTML,/data-nav="create"/);
 assert.match(node.innerHTML,/data-nav="work"/);
 assert.match(node.innerHTML,/АКТИВНОСТЬ АГЕНТА/);
 assert.match(node.innerHTML,/Не подтверждена/);
 assert.match(node.innerHTML,/Проверенный снимок/);
});

test('dated snapshot has immutable source paths to real merged PRs, not a false live heartbeat',()=>{
 const source=vm.runInNewContext(read('work-evidence.js')+';window.MondayWorkEvidence',
   {window:{},Date});
 // above returns undefined without adding global window; use separate context below
 const context={window:{},Date};vm.runInNewContext(read('work-evidence.js'),context);
 const snapshot=context.window.MondayWorkEvidence.snapshot();
 assert.equal(snapshot.source,'snapshot');
 assert.equal(snapshot.checkedAt,null);
 assert.equal(snapshot.asOf,'2026-10-22');
 assert.equal(snapshot.items.length,6);
 assert.ok(snapshot.items.every(x=>x.url.endsWith('/pull/'+x.number)));
 assert.ok(snapshot.items.some(x=>x.number===179));
});

test('verified fetch explicitly labels GitHub result and excludes unmerged requests',async()=>{
 const context={window:{},Date};vm.runInNewContext(read('work-evidence.js'),context);
 let calls=0;
 const fetch=async(url,options)=>{
   calls++;assert.match(url,/api\.github\.com\/repos\//);assert.equal(options.method,'GET');
   return {ok:true,json:async()=>[
     {number:301,title:'Verified change',merged_at:'2026-10-22T12:00:00Z'},
     {number:302,title:'Not yet merged',merged_at:null}
   ]};
 };
 const data=await context.window.MondayWorkEvidence.retrieve(fetch);
 assert.equal(data.source,'github');
 assert.equal(data.items.length,1);
 assert.equal(data.items[0].number,301);
 assert.equal(calls,1);
});

test('remote PR titles are escaped as text; user document cannot inject HTML',async()=>{
 const {context,node,workBody}=start({fetchImpl:async()=>({ok:true,json:async()=>[
   {number:302,title:'<img src=x onerror=alert(1)>',merged_at:'2026-10-22T13:00:00Z'}
 ]})});
 context.__work.go('work');
 await new Promise(resolve=>setImmediate(resolve));
 const html=workBody.innerHTML;
 assert.match(html,/&lt;img/);
 assert.doesNotMatch(html,/<img src=x onerror=/);
 assert.match(html,/Слито в GitHub/);
 assert.match(node.innerHTML,/work-proof/);
});

test('no network retains dated snapshot and always calls honest state out',async()=>{
 const {context,node}=start({fetchImpl:async()=>{throw Error('network down')}});
 context.__work.go('work');
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(node.innerHTML,/Проверенный снимок/);
 assert.match(node.innerHTML,/Не является показателем работы в фоне/);
});

test('static assets load proof module before app and include it in offline cache',()=>{
 const html=read('index.html'),sw=read('sw.js');
 assert.ok(html.indexOf('work-evidence.js')<html.indexOf('app.js'));
 assert.match(sw,/work-evidence\.js/);
 assert.match(sw,/monday-surface02-shell-v6/);
 assert.match(read('app.css'),/work-stage/);
});
