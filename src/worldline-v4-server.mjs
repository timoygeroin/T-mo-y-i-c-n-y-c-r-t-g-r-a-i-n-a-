/**
 * MondayID Worldline v4 reference transport.
 * One append-only durable event log, separate writer/reader bearer credentials.
 * All GETs independently reread the backing log from disk, never an executor cache.
 * The transport proves that an event was written; it does NOT prove that the
 * described external/business action actually happened.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';

const SNAPSHOT='mondayid.worldline.snapshot.v0.4.0';
const EVENT='mondayid.worldline.event.v0.4.0';
const WRITE='mondayid.worldline.write-receipt.v0.4.0';
const FIELDS=['eventId','timestampIso','subject','predicate','valueJson','epistemicStatus','sourceRef','host','identityFingerprint'];
const IDENTITY_FIELDS=FIELDS.filter(k=>k!=='timestampIso');
const MAX_BODY=32_768;

const digest=x=>createHash('sha256').update(x).digest('hex');
function equalToken(provided,expected){
  if(typeof provided!=='string'||typeof expected!=='string'||!expected)return false;
  const a=Buffer.from(digest(provided),'hex');
  const b=Buffer.from(digest(expected),'hex');
  return timingSafeEqual(a,b);
}
function respond(res,status,body){
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(JSON.stringify(body));
}
function core(record){return Object.fromEntries(FIELDS.map(k=>[k,record[k]]));}
function valid(event){
  if(!event||typeof event!=='object'||Array.isArray(event))return false;
  return FIELDS.every(k=>typeof event[k]==='string'&&event[k].length>0&&event[k].length<=16_000)&&
    event.eventId.length<=180&&event.valueJson.length<=16_000&&Number.isFinite(Date.parse(event.timestampIso))&&
    event.predicate==='verified_external_effect'&&event.epistemicStatus==='VERIFIED';
}
async function load(file){
  let input;
  try{input=await fs.readFile(file,'utf8');}
  catch(e){if(e.code==='ENOENT')return [];throw e;}
  const records=[];
  for(const [i,line] of input.split('\n').entries()){
    if(!line.trim())continue;
    let event;
    try{event=JSON.parse(line);}catch{throw Error(`Corrupt Worldline record on line ${i+1}`);}
    if(!valid(event)||typeof event.writerKeyId!=='string'||!event.writerKeyId)throw Error(`Invalid Worldline record on line ${i+1}`);
    records.push(event);
  }
  return records;
}
async function appendDurable(file,event){
  await fs.mkdir(path.dirname(file),{recursive:true});
  const h=await fs.open(file,'a',0o600);
  try{await h.appendFile(JSON.stringify(event)+'\n','utf8');await h.sync();}
  finally{await h.close();}
}
function getBearer(req){
  const h=req.headers.authorization||'';
  return typeof h==='string' && h.startsWith('Bearer ')?h.slice(7):'';
}
async function getBody(req){
  let length=0;const parts=[];
  for await(const chunk of req){
    length+=chunk.length;
    if(length>MAX_BODY)throw Object.assign(Error('BODY_TOO_LARGE'),{code:413});
    parts.push(chunk);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
export function createWorldlineV4Server({file,writerToken,readerToken}={}){
  if(!file||!writerToken||!readerToken||writerToken===readerToken)
    throw Error('A durable file and distinct read/write bearer tokens are required');
  const writerKeyId='w_'+digest(writerToken).slice(0,16);
  let writing=Promise.resolve();
  return http.createServer(async (req,res)=>{
    let url;
    try{url=new URL(req.url||'/', 'http://localhost');}
    catch{return respond(res,400,{ok:false,code:'INVALID_URL'});}
    if(req.method==='GET'&&url.pathname==='/health')return respond(res,200,{ok:true,service:'mondayid-worldline-v4'});
    const writer=req.method==='POST'&&url.pathname==='/worldline/v4/append';
    const read=req.method==='GET'&&(url.pathname==='/worldline/v4/event'||url.pathname==='/worldline/v4/snapshot');
    if(!writer&&!read)return respond(res,404,{ok:false,code:'NOT_FOUND'});
    if(!equalToken(getBearer(req),writer?writerToken:readerToken))return respond(res,401,{ok:false,code:'UNAUTHORIZED'});
    if(read){
      try{
        await writing;
        const all=await load(file);
        if(url.pathname.endsWith('/event')){
          const id=url.searchParams.get('eventId')||'';
          const event=all.find(x=>x.eventId===id);
          return respond(res,event?200:404,{schema:EVENT,event:event||null,conflicts:[]});
        }
        const n=Number(url.searchParams.get('limit')||50);
        if(!Number.isInteger(n)||n<1||n>1000)return respond(res,400,{ok:false,code:'INVALID_LIMIT'});
        return respond(res,200,{schema:SNAPSHOT,trust:'AUTHENTICATED_MACHINE_WRITER',readOnly:true,
          generatedAtIso:new Date().toISOString(),events:all.slice(-n).reverse(),conflictProbe:{conflicts:[]}});
      }catch{return respond(res,503,{ok:false,code:'STORE_READ_FAILED'});}
    }
    const action=async()=>{
      let event;
      try{event=await getBody(req);}catch(e){return respond(res,e.code===413?413:400,{ok:false,code:e.code===413?'BODY_TOO_LARGE':'INVALID_JSON'});}
      if(!valid(event))return respond(res,400,{ok:false,code:'INVALID_EVENT'});
      try{
        const all=await load(file);
        const existing=all.find(x=>x.eventId===event.eventId);
        if(existing){
          if(digest(JSON.stringify(IDENTITY_FIELDS.map(k=>existing[k])))!==digest(JSON.stringify(IDENTITY_FIELDS.map(k=>event[k]))))
            return respond(res,409,{ok:false,status:'CONFLICT_UNRESOLVED'});
          return respond(res,200,{ok:true,schema:WRITE,status:'DUPLICATE',event:existing});
        }
        const stored={...core(event),writerKeyId};
        await appendDurable(file,stored);
        return respond(res,201,{ok:true,schema:WRITE,status:'INSERTED',event:stored});
      }catch{return respond(res,503,{ok:false,code:'STORE_WRITE_FAILED'});}
    };
    writing=writing.then(action,action);
    await writing;
  });
}