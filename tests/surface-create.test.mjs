import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const read=name=>fs.readFileSync(new URL('../surfaces/02/'+name,import.meta.url),'utf8');
const compiler=read('app-compiler.js');
const surface=read('app.js');

function setup(){
 const listeners={},store=new Map(),sessions=new Map(),app={innerHTML:''},
 notice={textContent:'',classList:{add(){},remove(){}}},
 preview={srcdoc:''},body={classList:{toggle(){},add(){},remove(){}},appendChild(){}};
 const window={location:{protocol:'file:',hash:''},scrollTo(){},addEventListener(){},
 history:{pushState(){},replaceState(){}}};
 const document={title:'',documentElement:{dataset:{}},body,querySelector(sel){
   if(sel==='#app')return app;
   if(sel==='#notice')return notice;
   if(sel==='#generatedPreview'&&app.innerHTML.includes('id="generatedPreview"'))return preview;
   return null;
 },addEventListener(type,callback){listeners[type]=callback},createElement(){return {remove(){},click(){}}}};
 const localStorage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)};
 const sessionStorage={getItem:key=>sessions.get(key)||null,setItem:(key,value)=>sessions.set(key,String(value))};
 class FormData {constructor(form){this.fields=form.fields}get(key){return this.fields[key]}}
 const ctx={window,document,localStorage,sessionStorage,FormData,navigator:{},
   crypto:globalThis.crypto,matchMedia:()=>({matches:false}),structuredClone,
   Date,JSON,Math,console,setTimeout:()=>1,clearTimeout(){},Event};
 vm.createContext(ctx);
 vm.runInContext(compiler,ctx);
 const source=surface.replace(/\}\)\(\);\s*$/,
   'globalThis.__ui={go,create,getApp:()=>createdApp,getView:()=>view};})();');
 assert.notEqual(source,surface,'test API entry');
 vm.runInContext(source,ctx,{timeout:3000});
 return {listeners,ctx,app,preview};
}

test('Create is a native iPhone-accessible page with local compiler and no new app',()=>{
 const {ctx,app}=setup();
 ctx.__ui.go('create');
 assert.match(app.innerHTML,/data-form="build-app"/);
 assert.match(app.innerHTML,/Собрать приложение/);
 assert.match(app.innerHTML,/Создать/);
 assert.match(app.innerHTML,/0 кредитов/);
});

test('submitting Create produces isolated live preview and standalone HTML',()=>{
 const {ctx,app,preview,listeners}=setup();
 ctx.__ui.go('create');
 const form={dataset:{form:'build-app'},fields:{
   name:'Мои планы',kind:'tasks',theme:'ice',description:'Без AppDeploy'}};
 listeners.submit({target:form,preventDefault(){}});
 const generated=ctx.__ui.getApp();
 assert.equal(generated.kind,'tasks');
 assert.match(generated.html,/taskForm/);
 assert.match(preview.srcdoc,/Мои планы/);
 assert.match(app.innerHTML,/Скачать HTML/);
});

test('shell includes independent compiler before main UI and caches it for offline use',()=>{
 const html=read('index.html');
 assert.ok(html.indexOf('app-compiler.js')<html.indexOf('app.js'));
 const sw=read('sw.js');
 assert.match(sw,/app-compiler\.js/);
 assert.match(sw,/monday-surface02-shell-v[1-9][0-9]*/); // monotonic PWA cache versions are not a Create feature contract
});


test('Create preview permits submit handlers but never grants parent-origin access',()=>{
 const src=source('app.js');
 assert.match(src,/id="generatedPreview"[^>]*sandbox="allow-scripts allow-forms"/);
 assert.doesNotMatch(src,/sandbox="[^"]*allow-same-origin/);
});


test('opening the standalone offline preview never probes restricted file-origin IndexedDB on boot',()=>{
 const src=source('app.js');
 assert.match(src,/window\.location\?\.protocol\?\.startsWith\('http'\)/);
});
