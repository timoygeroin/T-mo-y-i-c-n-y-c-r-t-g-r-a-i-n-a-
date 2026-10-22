import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildBrowserLocalActions} from '../scripts/build-surface-local-actions.mjs';
const read=n=>fs.readFileSync(new URL('../surfaces/02/'+n,import.meta.url),'utf8');
test('browser engine is derived exactly from canonical code',()=>{
 const a=fs.readFileSync(new URL('../src/local-intent-compiler.mjs',import.meta.url),'utf8');
 const b=fs.readFileSync(new URL('../src/consumer-local-receptor.mjs',import.meta.url),'utf8');
 assert.equal(read('local-actions.js'),buildBrowserLocalActions(a,b));
});
test('local engine compiles offline and refuses external verification claims',async()=>{
 const window={};vm.runInNewContext(read('local-actions.js'),{window});
 const engine=window.MondayLocalActions;
 assert.equal(engine.compileLocalIntent('/task Test MondayID').kind,'task');
 let saved=null;
 const result=await engine.runLocalAction({text:'/task Test MondayID',state:{},nextId:()=> 'localtest001',
   write:async state=>{saved=JSON.parse(JSON.stringify(state));return true},
   read:async()=>saved});
 assert.equal(result.ok,true);
 assert.equal(result.independentExternalEffect,false);
 assert.equal(saved.receipts[0].verified,false);
});
