import readline from 'node:readline';
import { mkdirSync } from 'node:fs';
import { openOrganism, seedMandate } from './core.js';
mkdirSync('var',{recursive:true}); const o=openOrganism(); seedMandate(o);
const tools=[
  {name:'monday_status',description:'Read organism truth state',inputSchema:{type:'object'}},
  {name:'monday_ingest_signal',description:'Persist a raw user signal before interpretation',inputSchema:{type:'object',properties:{raw_text:{type:'string'},source:{type:'string'}},required:['raw_text']}},
  {name:'monday_save_continuity',description:'Persist a cross-chat continuity packet',inputSchema:{type:'object',additionalProperties:true}}
];
const reply=(id,result)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\n');
readline.createInterface({input:process.stdin}).on('line',line=>{try{const q=JSON.parse(line);if(q.method==='initialize')return reply(q.id,{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'mondayid-organism',version:'0.2.0'}});if(q.method==='tools/list')return reply(q.id,{tools});if(q.method==='tools/call'){const a=q.params?.arguments??{};let data;if(q.params.name==='monday_status')data=o.status();else if(q.params.name==='monday_ingest_signal')data={id:o.ingest(a.raw_text,a.source)};else if(q.params.name==='monday_save_continuity')data={id:o.saveContinuity(a)};else throw new Error('UNKNOWN_TOOL');return reply(q.id,{content:[{type:'text',text:JSON.stringify(data)}]});}}catch(e){process.stdout.write(JSON.stringify({jsonrpc:'2.0',error:{code:-32000,message:e.message}})+'\n')}});
