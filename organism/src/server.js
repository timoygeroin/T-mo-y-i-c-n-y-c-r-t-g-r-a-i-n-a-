import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { openOrganism, seedMandate } from './core.js';
mkdirSync('var',{recursive:true});
const organism=openOrganism(); seedMandate(organism);
const send=(res,code,data)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
const body=req=>new Promise((ok,bad)=>{let x='';req.on('data',c=>x+=c);req.on('end',()=>{try{ok(x?JSON.parse(x):{})}catch(e){bad(e)}})});
const server=http.createServer(async(req,res)=>{try{
  if(req.method==='GET'&&req.url==='/health') return send(res,200,{ok:true,...organism.status()});
  if(req.method==='GET'&&req.url==='/snapshot') return send(res,200,organism.snapshot());
  if(req.method==='POST'&&req.url==='/signals'){const x=await body(req);return send(res,201,{id:organism.ingest(x.raw_text,x.source)});}
  if(req.method==='POST'&&req.url==='/continuity'){const x=await body(req);return send(res,201,{id:organism.saveContinuity(x)});}
  if(req.method==='POST'&&req.url==='/evidence'){const x=await body(req);return send(res,201,{id:organism.addEvidence(x.source_id,x.claim)});}
  return send(res,404,{error:'NOT_FOUND'});
}catch(e){return send(res,400,{error:e.message});}});
server.listen(Number(process.env.PORT??8787),()=>console.log('Monday/MondayID organism listening on :'+(process.env.PORT??8787)));
