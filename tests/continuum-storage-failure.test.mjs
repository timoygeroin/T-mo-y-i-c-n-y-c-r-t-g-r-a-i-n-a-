import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html', import.meta.url),'utf8');

test('failed local save does not become a phantom success',()=>{
 const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
 const core=source.slice(source.indexOf('const KEY='),source.indexOf('function heading('));
 let value=null,fail=false;
 const toast={textContent:'',classList:{add(){},remove(){}}};
 const context=vm.createContext({
   localStorage:{getItem(){return value},setItem(_k,v){if(fail)throw Error('quota');value=v}},
   document:{getElementById(){return toast}},clearTimeout(){},setTimeout(){return 1},render(){}
 });
 vm.runInContext(core,context);
 assert.equal(vm.runInContext("save('notes',{id:'a',title:'A',body:'old'},'captured')",context),true);
 fail=true;
 assert.equal(vm.runInContext("save('notes',{id:'b',title:'B',body:'new'},'captured')",context),false);
 assert.equal(vm.runInContext('data.notes.length',context),1);
 assert.match(toast.textContent,/Not saved/);
 assert.equal(JSON.parse(value).notes.length,1);
 assert.equal(vm.runInContext("data.notes[0].body='unsaved';persist()",context),false);
 assert.equal(vm.runInContext('data.notes[0].body',context),'old');
 vm.runInContext("toast('Note saved locally')",context);
 assert.match(toast.textContent,/Not saved/);
 fail=false;
 assert.equal(vm.runInContext("save('notes',{id:'c',title:'C',body:'new'},'captured')",context),true);
 assert.equal(JSON.parse(value).notes.length,2);
});
test('note, task and space editors stay open when browser storage refuses the save',()=>{
 for(const name of ['Note','Task','Space']){
   assert.ok(html.includes("if(!ok)return;closeModal();toast('"+name+" saved locally')"),name+' editor must remain open when unsaved');
 }
 assert.match(html,/if\(!persist\(\)\)return;render\(\)/);
 assert.match(html,/const current=data\.threads\.find\(x=>x\.id===threadId\)/);
});
