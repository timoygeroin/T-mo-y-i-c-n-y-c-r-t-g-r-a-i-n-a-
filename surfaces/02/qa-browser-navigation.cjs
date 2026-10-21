const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(__dirname+'/app.js','utf8');
const local=new Map(),session=new Map(),events={};
const app={innerHTML:'',classList:{toggle(){},add(){},remove(){}}},notice={textContent:'',classList:{toggle(){},add(){},remove(){}}};
const entries=[''],location={hash:'',protocol:'file:'};let index=0;
const history={
 pushState(_state,_title,path){entries.splice(index+1);entries.push(path);index++;location.hash=path},
 replaceState(_state,_title,path){entries[index]=path;location.hash=path},
 back(){if(index>0){index--;location.hash=entries[index];events.popstate?.()}}
};
const localStorage={getItem:k=>local.get(k)??null,setItem:(k,v)=>local.set(k,String(v))};
const sessionStorage={getItem:k=>session.get(k)??null,setItem:(k,v)=>session.set(k,String(v))};
function boot(){
 const doc={title:'',documentElement:{dataset:{}},body:{classList:{toggle(){},add(){},remove(){}}},
 querySelector:q=>q==='#app'?app:q==='#notice'?notice:null,addEventListener(){},createElement(){return {}}};
 const window={location,history,scrollTo(){},addEventListener(k,fn){events[k]=fn}};
 const context={document:doc,window,sessionStorage,localStorage,navigator:{},crypto:globalThis.crypto,matchMedia:()=>({matches:false}),structuredClone,Date,JSON,Math,console,setTimeout:()=>1,clearTimeout(){},Event};
 vm.createContext(context);
 const hooked=source.replace(/\}\)\(\);\s*$/,'globalThis.__qa={go,newThread,getView:()=>view,getThread:()=>threadId,readRoute};})();');
 assert.notEqual(hooked,source);
 vm.runInContext(hooked,context,{timeout:3000});
 return context.__qa;
}
const a=boot();
assert.equal(location.hash,'#/home');
a.newThread('Долгая задача');
const thread=a.getThread();
assert.equal(location.hash,'#/thread/'+thread);
a.go('chats');assert.equal(location.hash,'#/chats');
history.back();assert.equal(a.getView(),'thread');assert.equal(a.getThread(),thread);
const b=boot();
assert.equal(b.getView(),'thread');assert.equal(b.getThread(),thread);
b.go('home');assert.equal(location.hash,'#/home');
location.hash='#/thread/nonexistent';events.popstate();assert.equal(b.getView(),'home');
console.log('PASS: browser Back, direct hash routes, reload restores real thread, stale link falls back safely');
