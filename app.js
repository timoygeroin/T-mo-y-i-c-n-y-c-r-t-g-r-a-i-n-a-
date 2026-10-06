const $=id=>document.getElementById(id);
const $$=sel=>Array.from(document.querySelectorAll(sel));
const STORAGE='monday.consumer.v1';
const now=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(16).slice(2);
const safe=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const ago=iso=>{if(!iso)return'';const d=Math.max(0,Date.now()-new Date(iso).getTime());const m=Math.floor(d/60000);if(m<1)return'now';if(m<60)return m+'m';const h=Math.floor(m/60);if(h<24)return h+'h';return Math.floor(h/24)+'d';};

const fresh=()=>({
  version:1,
  view:'home',
  chats:[],
  spaces:[],
  library:[],
  ideas:[],
  tasks:[],
  signals:[],
  activity:[],
  media:[],
  trash:[],
  settings:{initiative:'Balanced',autonomy:'Bounded',memory:'Inspectable',voice:'Monday',appearance:'Liquid Glass',privacy:'Local-first'},
  runtime:{presence:'recovering',live:false,syncedAt:null,status:null,boot:null,state:null,error:null}
});
let state=load();
let currentObject=null;
let currentDepth='surface';
let libraryFilter='All';
let lastTrashed=null;
let toastTimer=null;
let pinchStart=null;

function load(){
  try{
    const v=JSON.parse(localStorage.getItem(STORAGE));
    if(!(v&&v.version===1))return fresh();
    const restored={...fresh(),...v,runtime:{...fresh().runtime,...(v.runtime||{})}};
    restored.runtime.presence='recovering';
    restored.runtime.live=false;
    restored.runtime.error=null;
    return restored;
  }catch{return fresh();}
}
function save(){localStorage.setItem(STORAGE,JSON.stringify(state));}
function record(title,detail,kind='local'){
  state.activity.unshift({id:uid(),title,detail,kind,createdAt:now()});
  state.activity=state.activity.slice(0,100);save();renderActivityDot();
}
function route(view){
  state.view=view;save();
  $$('.view').forEach(v=>v.classList.toggle('active',v.dataset.view===view));
  $$('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===view));
  window.scrollTo({top:0,behavior:'smooth'});
  render(view);
}
function render(view=state.view){
  if(view==='home')renderHome();
  if(view==='chats')renderChats();
  if(view==='spaces')renderSpaces();
  if(view==='you')renderYou();
  if(view==='library')renderLibrary();
  if(view==='ideas')renderIdeas();
  if(view==='activity')renderActivity();
  if(view==='vision')renderVision();
  renderActivityDot();
}
function empty(text){return '<div class="empty">'+safe(text)+'</div>';}
function card(o,wide=false){
  return '<button class="object-card '+(wide?'wide':'')+'" data-object="'+safe(o.id)+'" data-kind="'+safe(o.kind)+'"><div class="kind">'+safe(o.kind)+'</div><h3>'+safe(o.title)+'</h3><p>'+safe(o.body||o.detail||'')+'</p></button>';
}
function row(o,icon='◇'){
  return '<button class="list-row" data-object="'+safe(o.id)+'" data-kind="'+safe(o.kind)+'"><span class="list-icon">'+icon+'</span><span class="list-copy"><b>'+safe(o.title)+'</b><p>'+safe(o.body||o.detail||'')+'</p></span><span class="list-meta">'+ago(o.updatedAt||o.createdAt)+'</span></button>';
}
function allObjects(){
  return [
    ...state.chats.map(x=>({...x,kind:'chat'})),
    ...state.spaces.map(x=>({...x,kind:'space'})),
    ...state.library.map(x=>({...x,kind:'file'})),
    ...state.ideas.map(x=>({...x,kind:'idea'})),
    ...state.tasks.map(x=>({...x,kind:'task'})),
    ...state.signals.map(x=>({...x,kind:'signal'}))
  ];
}
function objectArrayKey(kind){return ({chat:'chats',space:'spaces',file:'library',idea:'ideas',task:'tasks',signal:'signals'})[kind]||null;}
function findObject(id,kind){
  const key=objectArrayKey(kind);
  return key?(state[key]||[]).find(x=>x.id===id):null;
}
function words(text){
  const stop=new Set(['this','that','with','from','have','your','what','when','where','will','into','about','just','only','then','than','как','что','это','для','или','при','она','оно','они','его','её','мне','тебя','так','всё','все','уже','если','чтобы','когда']);
  return new Set(String(text||'').toLowerCase().replace(/[^a-zа-яё0-9\s-]/gi,' ').split(/\s+/).filter(w=>w.length>3&&!stop.has(w)));
}
function resonanceFor(o){
  const base=words((o.title||'')+' '+(o.body||o.detail||''));
  return allObjects().filter(x=>x.id!==o.id).map(x=>{
    const other=words((x.title||'')+' '+(x.body||x.detail||''));
    const shared=[...base].filter(w=>other.has(w));
    const sameSpace=Boolean(o.spaceID&&x.spaceID&&o.spaceID===x.spaceID);
    return {...x,shared,sameSpace,score:shared.length+(sameSpace?2:0)};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,8);
}
function showToast(text,action){
  clearTimeout(toastTimer);$('toastText').textContent=text;$('toastAction').style.display=action?'block':'none';$('toast').classList.add('show');
  $('toastAction').onclick=()=>{if(action)action();$('toast').classList.remove('show');};
  toastTimer=setTimeout(()=>$('toast').classList.remove('show'),5000);
}
function renderHome(){
  const recent=[...allObjects()].sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt))[0];
  $('continueCard').innerHTML=recent?
    '<div class="big">'+safe(recent.title)+'</div><div class="meta">'+safe(recent.body||recent.detail||'Persistent object')+'</div><div class="row"><span class="badge">'+safe(recent.kind)+'</span><button class="pill-button" data-object="'+recent.id+'" data-kind="'+recent.kind+'">Open</button></div>':
    '<div class="big">Your first living thread starts here.</div><div class="meta">Say something once. Monday will preserve it as a persistent Signal instead of pretending an empty screen already knows it.</div>';
  const runtime=state.runtime;
  const workState=runtime.status?.work?.wholeProductComplete===true?'Verified product':runtime.status?.work?.controlPlane?.available?'Control plane available':'Host state pending';
  const cards=[
    {id:'runtime',kind:'runtime',title:'Monday',body:presenceDetail()},
    {id:'work',kind:'runtime',title:'Work',body:workState},
    ...state.tasks.filter(t=>['Running','Waiting','Needs you','Changed'].includes(t.state)).slice(0,4)
  ];
  $('todayGrid').innerHTML=cards.length?cards.map((x,i)=>card(x,i===0)).join(''):empty('No active objects.');
  const pinned=allObjects().filter(x=>x.pinned);
  $('pinnedStrip').innerHTML=pinned.length?pinned.map(x=>card(x)).join(''):empty('Pin any object and it stays here.');
  const ok=runtime.live===true&&runtime.presence==='verified';
  $('runtimeChip').textContent=ok?'VERIFIED':runtime.presence==='gate'?'NEEDS YOU':runtime.presence==='working'?'WORKING':'READING';
  $('heroEyebrow').textContent=ok?'CONTINUITY LIVE':'NOW';
  $('heroTitle').textContent=recent?'Continue.':'Monday.';
  $('heroSub').textContent=ok?'Current Generation-5 state was read back from the live host.':'Reading the current worldline, not a cached story.';
}
function renderChats(){
  const q=$('chatFilter').value.trim().toLowerCase();
  const items=state.chats.filter(x=>!q||x.title.toLowerCase().includes(q)||(x.body||'').toLowerCase().includes(q));
  $('chatList').innerHTML=items.length?items.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).map(x=>row(x,'◫')).join(''):
    empty('No chat objects yet. Create a thread or turn a Signal into one.');
}
function renderSpaces(){
  $('spacesList').innerHTML=state.spaces.length?state.spaces.map(x=>row(x,'◇')).join(''):empty('Spaces keep a project, person, topic or trip alive across chats.');
}
function renderLibrary(){
  const kinds=['All','Document','Image','Video','Audio','Generated','Code','Presentation','Table'];
  $('libraryFilters').innerHTML=kinds.map(k=>'<button data-filter="'+k+'" class="'+(libraryFilter===k?'active':'')+'">'+k+'</button>').join('');
  const items=state.library.filter(x=>libraryFilter==='All'||x.fileType===libraryFilter);
  $('libraryList').innerHTML=items.length?items.map(x=>row(x,'▧')).join(''):empty('Library is empty. Create or capture an object.');
}
function renderIdeas(){
  $('ideaList').innerHTML=state.ideas.length?state.ideas.map(x=>row(x,'✦')).join(''):empty('No idea is discarded because it looked too ambitious. Put the fragment here first.');
}
function renderYou(){
  const r=state.runtime;
  const installed=window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true;
  const entries=[
    ['Personality','Monday','One continuing identity across replaceable hosts'],
    ['Intelligence',r.status?.host?.kernel||'Generation-5','Host is substrate, not identity'],
    ['Memory',state.settings.memory,'Why / source / date / confidence must stay inspectable'],
    ['Voice',state.settings.voice,'Same identity in text and voice'],
    ['Appearance',state.settings.appearance,'Quiet premium material; no cyberpunk shell'],
    ['Initiative',state.settings.initiative,'Presence appears when useful and can stay silent'],
    ['Autonomy',state.settings.autonomy,'Human Gate for consequential irreversible actions'],
    ['Connections',r.status?.host?.continuity?.trusted_worldline_configured?'Worldline connected':'Read connection pending','Current host readback'],
    ['Automations','Autopoiesis','Bounded wake / repair / resume'],
    ['Privacy',state.settings.privacy,'Local objects remain local unless explicitly moved']
  ];
  $('settingsList').innerHTML='<div class="setting-row"><div class="copy"><b>iPhone body</b><span>Install this verified web body on the Home Screen without App Store or payment.</span></div><button id="installMonday">'+(installed?'Installed':'Install')+'</button></div>'+entries.map(([k,v,d])=>'<div class="setting-row"><div class="copy"><b>'+safe(k)+'</b><span>'+safe(d)+'</span></div><button>'+safe(v)+'</button></div>').join('');
  const install=$('installMonday');if(install)install.onclick=()=>openInstall(installed);
}
function renderActivity(){
  const r=state.runtime;
  const h=r.status?.host||{};
  const w=r.status?.work||{};
  $('runtimePanel').innerHTML='<div class="runtime-grid">'+[
    ['Kernel',h.kernel||'unknown'],
    ['Worldline',h.continuity?.trusted_worldline_configured?'trusted read':'unknown'],
    ['Work',w.controlPlane?.available?'available':'unknown'],
    ['Shared write',w.sharedWrite?.verified?'verified':'not verified']
  ].map(([k,v])=>'<div class="runtime-fact"><small>'+k+'</small><b>'+safe(v)+'</b></div>').join('')+
  '</div><div class="runtime-note">'+safe(r.error?('Last readback failed: '+r.error):(r.syncedAt?'Last readback '+new Date(r.syncedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'No live readback yet.'))+'</div>';
  $('activityList').innerHTML=state.activity.length?state.activity.map(x=>'<div class="list-row"><span class="list-icon">'+(x.kind==='runtime'?'◌':'·')+'</span><span class="list-copy"><b>'+safe(x.title)+'</b><p>'+safe(x.detail)+'</p></span><span class="list-meta">'+ago(x.createdAt)+'</span></div>').join(''):empty('Activity shows real changes, not fake progress.');
}
function renderActivityDot(){
  const recent=state.activity[0];
  $('activityDot').classList.toggle('on',Boolean(recent&&Date.now()-new Date(recent.createdAt).getTime()<15*60*1000));
}
function renderVision(){
  $('visionStage').innerHTML=state.media.length?state.media.map(m=>'<div class="media-card">'+(m.type.startsWith('image/')&&m.dataUrl?'<img src="'+m.dataUrl+'" alt="">':m.type.startsWith('video/')&&m.dataUrl?'<video src="'+m.dataUrl+'" controls></video>':'')+'<div class="list-row"><span class="list-copy"><b>'+safe(m.name)+'</b><p>'+safe(m.type)+' · local capture</p></span><span class="list-meta">'+ago(m.createdAt)+'</span></div></div>').join(''):empty('Capture an image or video. It stays local until you explicitly move/share it.');
}
function presenceDetail(){
  const r=state.runtime;
  if(r.live===true&&r.presence==='verified') return 'Live Generation-5 readback · continuity attached';
  if(r.live!==true&&r.syncedAt) return 'Cached prior state · live verification required';
  if(r.presence==='gate') return 'Runtime answered with an unresolved gate';
  if(r.error) return 'Live readback failed · no success claimed';
  return 'Recovering live state';
}
function setPresence(p,text){
  state.runtime.presence=p;
  document.body.dataset.presence=p;
  $('presenceText').textContent=text||presenceDetail();
  save();
}
async function mcpCall(name,args={}){
  const res=await fetch('/api/mcp',{method:'POST',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method:'tools/call',params:{name,arguments:args}})});
  if(!res.ok)throw new Error('MCP '+res.status);
  const env=await res.json();if(env.error)throw new Error(env.error.message||'MCP error');
  const raw=env.result?.structuredContent??env.result?.content?.[0]?.text??env.result;
  if(typeof raw==='string'){try{return JSON.parse(raw)}catch{return raw}}return raw;
}
async function syncRuntime(){
  setPresence('working','Reading live state…');
  try{
    const [status,boot,mcpState]=await Promise.all([
      fetch('/api/status',{cache:'no-store'}).then(r=>r.json()),
      fetch('/api/boot',{cache:'no-store'}).then(r=>r.json()),
      mcpCall('get_state',{limit:1}).catch(()=>null)
    ]);
    state.runtime={...state.runtime,status,boot,state:mcpState,live:true,syncedAt:now(),error:null};
    const verified=Boolean(status?.ok&&status?.host?.generation===5&&(boot?.pass?.state==='FULFILLED'||boot?.surface?.state==='VERIFIED'));
    setPresence(verified?'verified':'gate',verified?'With you · live state verified':'Live host · verification incomplete');
    record(verified?'Runtime verified':'Runtime observed',verified?'Generation 5 + boot readback':'Host responded without full verification','runtime');
  }catch(e){
    state.runtime.error=String(e.message||e);state.runtime.live=false;state.runtime.syncedAt=now();setPresence('gate','Readback failed · claim withheld');save();
    record('Runtime readback failed',state.runtime.error,'runtime');
  }
  render();
}
function openCreate(type){
  const label={space:'Space',idea:'Idea',document:'Document',presentation:'Presentation',table:'Table',research:'Research',code:'Code / Build',reminder:'Reminder',automation:'Automation',chat:'Chat',voice:'Voice capture',camera:'Camera capture',scan:'Scan',image:'Image'}[type]||'Object';
  if(['voice','camera','scan','image'].includes(type)){
    const input=$('hiddenFile');
    input.accept=type==='voice'?'audio/*':type==='scan'?'image/*,application/pdf':'image/*,video/*';
    if(type==='camera'||type==='scan')input.setAttribute('capture','environment');else input.removeAttribute('capture');
    input.dataset.createType=type;input.click();return;
  }
  $('createType').value=type;$('createTitle').textContent=label;$('createName').value='';$('createBody').value='';$('createPinned').checked=false;$('createDialog').showModal();$('createName').focus();
}
function createObject(type,title,body,pinned=false){
  const created=now();
  const base={id:uid(),title,body,createdAt:created,updatedAt:created,pinned,spaceID:null,provenance:'created locally in Monday',versions:[{at:created,title,body}]};
  if(type==='space')state.spaces.unshift({...base,kind:'space'});
  else if(type==='idea')state.ideas.unshift({...base,kind:'idea',status:'Fragment'});
  else if(type==='chat')state.chats.unshift({...base,kind:'chat'});
  else if(type==='reminder'||type==='automation')state.tasks.unshift({...base,kind:'task',detail:body,state:'Waiting',isAutomation:type==='automation'});
  else state.library.unshift({...base,kind:'file',fileType:({presentation:'Presentation',table:'Table',code:'Code'}[type]||'Document')});
  save();record('Created '+type,title);render();
}
function openObject(id,kind){
  if(kind==='runtime'){ $('stateDialog').showModal();renderStateDialog();return; }
  currentObject=findObject(id,kind);if(!currentObject)return;
  currentDepth='surface';$('objectKind').textContent=kind.toUpperCase();$('objectTitle').textContent=currentObject.title;renderObjectBody();$('objectDialog').showModal();
}
function openEdit(){
  if(!currentObject)return;
  $('editName').value=currentObject.title||'';$('editBody').value=currentObject.body||currentObject.detail||'';$('editPinned').checked=Boolean(currentObject.pinned);
  $('editSpace').innerHTML='<option value="">No Space</option>'+state.spaces.filter(s=>s.id!==currentObject.id).map(s=>'<option value="'+s.id+'">'+safe(s.name||s.title)+'</option>').join('');
  $('editSpace').value=currentObject.spaceID||'';$('editDialog').showModal();
}
function openInstall(installed){
  $('installBody').innerHTML=installed?
    '<div class="install-state"><b>Monday is already running as a Home Screen app.</b><br><span class="badge ok">standalone body observed</span></div><p>This body keeps local objects on the device and reads live Generation-5 truth only when the network readback succeeds.</p>':
    '<div class="install-state"><b>No App Store and no payment are required for this web body.</b></div><ol><li>Open Monday in Safari.</li><li>Tap the Share button.</li><li>Choose <b>Add to Home Screen</b>.</li><li>Open the new Monday icon. The app launches standalone and keeps local objects on this iPhone.</li></ol><p class="badge warn">Dynamic Island / Live Activity still require the native iOS body.</p>';
  $('installDialog').showModal();
}
function renderObjectBody(){
  if(!currentObject)return;
  $('.depth-control button').forEach(b=>b.classList.toggle('active',b.dataset.depth===currentDepth));
  const space=currentObject.spaceID?state.spaces.find(s=>s.id===currentObject.spaceID):null;
  let out='';
  if(currentDepth==='surface'){
    out='<h3>'+safe(currentObject.title)+'</h3><p>'+safe(currentObject.body||currentObject.detail||'No surface text.')+'</p>'+
      (space?'<p><span class="badge">Space · '+safe(space.name||space.title)+'</span></p>':'');
    if(currentObject.kind==='task'){
      const states=['Running','Waiting','Needs you','Completed','Changed','Failed'];
      out+='<div class="task-states">'+states.map(s=>'<button data-task-state="'+s+'" class="'+(currentObject.state===s?'active':'')+'">'+s+'</button>').join('')+'</div>';
    }
  }
  if(currentDepth==='inside'){
    out='<p><b>State</b></p><p>'+safe(currentObject.state||currentObject.status||'Persistent')+'</p><p><b>Created</b></p><p>'+new Date(currentObject.createdAt).toLocaleString()+'</p>'+
      '<p><b>Versions</b></p><p>'+String((currentObject.versions||[]).length)+' recorded state(s)</p>';
  }
  if(currentDepth==='relations'){
    const related=resonanceFor(currentObject);
    const owned=currentObject.kind==='space'?allObjects().filter(x=>x.spaceID===currentObject.id):[];
    out='<p><b>Explicit relation</b></p><p>'+(space?'Inside '+safe(space.name||space.title):currentObject.kind==='space'?(owned.length+' object(s) currently inside this Space'):'No Space assigned')+'</p>';
    if(owned.length)out+='<div class="relation-list">'+owned.map(x=>'<div class="relation"><b>'+safe(x.title)+'</b><span>member · '+safe(x.kind)+'</span></div>').join('')+'</div>';
    out+='<p><b>Resonance</b></p><p>Only evidence-backed local relations are shown: shared Space or shared terms. No hidden semantic claim is invented.</p>'+
      (related.length?'<div class="relation-list">'+related.map(x=>'<div class="relation"><b>'+safe(x.title)+'</b><span>'+(x.sameSpace?'same Space · ':'')+(x.shared.length?'shared: '+safe(x.shared.join(', ')):'explicit relation')+'</span></div>').join('')+'</div>':'<p class="badge">No observable resonance yet</p>');
  }
  if(currentDepth==='evidence'){
    out='<p><b>Evidence Lens</b></p><p>Local provenance: '+safe(currentObject.provenance||'created on this device')+'.</p>'+
      '<p>Updated: '+new Date(currentObject.updatedAt||currentObject.createdAt).toLocaleString()+'</p>'+
      '<p><span class="badge">Requested ≠ Attempted ≠ Observed ≠ Verified</span></p>';
  }
  $('objectBody').innerHTML=out;
}
function renderStateDialog(){
  const r=state.runtime,s=r.status||{},h=s.host||{},w=s.work||{};
  $('stateBody').innerHTML='<div class="runtime-grid">'+[
    ['Presence',r.live===true?r.presence:'cached / unverified'],
    ['Generation',h.generation||'unknown'],
    ['Worldline',h.continuity?.trusted_worldline_configured?'connected':'unknown'],
    ['Shared writer',h.continuity?.trusted_writer_configured?'configured':'not configured'],
    ['iPhone-first',w.humanInterface?.iphoneFirst===true?'yes':'unknown'],
    ['Native app required',w.humanInterface?.nativeAppRequiredForHostWork===false?'no':'unknown']
  ].map(([k,v])=>'<div class="runtime-fact"><small>'+k+'</small><b>'+safe(v)+'</b></div>').join('')+'</div><button class="primary-action" id="stateSync">Sync reality</button>';
  setTimeout(()=>{const b=$('stateSync');if(b)b.onclick=syncRuntime;},0);
}
function searchAll(q){
  const v=q.trim().toLowerCase();if(!v)return[];
  return allObjects().filter(o=>(o.title+' '+(o.body||o.detail||'')+' '+o.kind).toLowerCase().includes(v)).slice(0,40);
}
async function shareText(title,text){
  if(navigator.share){try{await navigator.share({title,text});return}catch{}}
  await navigator.clipboard?.writeText(text);record('Copied for handoff',title);
}
function signalFromComposer(){
  const el=$('universalComposer');const text=el.value.trim();if(!text)return;
  const obj={id:uid(),title:text.slice(0,70),body:text,createdAt:now(),updatedAt:now(),pinned:false,kind:'signal',status:'OPEN',versions:[{at:now(),title:text.slice(0,70),body:text}]};
  state.signals.unshift(obj);
  state.chats.unshift({id:uid(),title:text.slice(0,44),body:'Signal preserved. Reasoning/execution remains in the current ChatGPT host until a shared writer/model route is verified.',createdAt:now(),updatedAt:now(),pinned:false,versions:[{at:now(),title:text.slice(0,44),body:text}]});
  el.value='';save();record('Signal preserved',obj.title);renderHome();openObject(obj.id,'signal');
}

$$('[data-tab]').forEach(b=>b.addEventListener('click',()=>route(b.dataset.tab)));
$$('[data-open]').forEach(b=>b.addEventListener('click',()=>route(b.dataset.open)));
document.addEventListener('click',e=>{
  const o=e.target.closest('[data-object]');if(o){openObject(o.dataset.object,o.dataset.kind);return;}
  const c=e.target.closest('[data-create]');if(c){openCreate(c.dataset.create);return;}
  if(e.target.matches('[data-close]'))e.target.closest('dialog')?.close();
  const f=e.target.closest('[data-filter]');if(f){libraryFilter=f.dataset.filter;renderLibrary();}
});
$('brandButton').onclick=()=>{renderStateDialog();$('stateDialog').showModal();};
$('activityButton').onclick=()=>route('activity');
$('searchButton').onclick=()=>{$('searchDialog').showModal();$('globalSearch').focus();};
$('globalSearch').addEventListener('input',e=>{$('searchResults').innerHTML=searchAll(e.target.value).map(x=>row(x,'⌕')).join('')||empty('No matching objects.');});
$('chatFilter').addEventListener('input',renderChats);
$('newChat').onclick=()=>openCreate('chat');
$('refreshRuntime').onclick=syncRuntime;
$('runtimeChip').onclick=()=>{renderStateDialog();$('stateDialog').showModal();};
$('composerSend').onclick=signalFromComposer;
$('universalComposer').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();signalFromComposer();}});
$('composerAttach').onclick=()=>route('create');
$('createForm').addEventListener('submit',e=>{e.preventDefault();const type=$('createType').value;const title=$('createName').value.trim();if(!title)return;createObject(type,title,$('createBody').value.trim(),$('createPinned').checked);$('createDialog').close();});
$('hiddenFile').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;const type=e.target.dataset.createType||'image';
  let dataUrl=null;if(file.size<1200000&&/^image\//.test(file.type))dataUrl=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(file);});
  state.media.unshift({id:uid(),name:file.name,type:file.type||type,size:file.size,createdAt:now(),dataUrl});
  state.library.unshift({id:uid(),title:file.name,body:'Local capture · '+(file.type||type),createdAt:now(),updatedAt:now(),pinned:false,kind:'file',fileType:/video/.test(file.type)?'Video':/audio/.test(file.type)?'Audio':'Image',versions:[]});
  save();record('Captured local media',file.name);route('vision');e.target.value='';
});
$('visionInput').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;let dataUrl=null;if(f.size<1200000&&/^image\//.test(f.type))dataUrl=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(f);});state.media.unshift({id:uid(),name:f.name,type:f.type,size:f.size,createdAt:now(),dataUrl});save();record('Vision capture',f.name);renderVision();});
$('[data-depth]').forEach(b=>b.addEventListener('click',()=>setDepth(b.dataset.depth)));
$('objectDialog').addEventListener('touchstart',e=>{
  if(e.touches.length!==2)return;const [a,b]=e.touches;pinchStart=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
},{passive:true});
$('objectDialog').addEventListener('touchend',e=>{
  if(pinchStart===null||e.touches.length!==0){if(e.touches.length===0)pinchStart=null;return;}
  const changed=e.changedTouches;if(changed.length<2){pinchStart=null;return;}
  const [a,b]=changed;const end=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);const ratio=end/pinchStart;pinchStart=null;
  if(ratio>1.22)cycleDepth(1);else if(ratio<.82)cycleDepth(-1);
},{passive:true});
function setDepth(depth){currentDepth=depth;renderObjectBody();}
function cycleDepth(direction=1){const order=['surface','inside','relations','evidence'];let i=order.indexOf(currentDepth);i=(i+direction+order.length)%order.length;setDepth(order[i]);}
$('peelButton').onclick=()=>cycleDepth(1);
$('timeButton').onclick=()=>{if(!currentObject)return;const versions=currentObject.versions||[];$('objectBody').innerHTML=versions.length?versions.map((v,i)=>'<p><b>v'+(i+1)+' · '+new Date(v.at).toLocaleString()+'</b><br>'+safe(v.body||v.title)+'</p>').join(''):'<p>No historical versions yet.</p>';};
$('ghostButton').onclick=()=>{if(!currentObject)return;const versions=currentObject.versions||[];const a=versions[0],b=versions[versions.length-1];$('objectBody').innerHTML=versions.length>1?'<p><span class="badge">OLD</span></p><p>'+safe(a.body||a.title)+'</p><p><span class="badge ok">NOW</span></p><p>'+safe(b.body||b.title)+'</p>':'<p>Ghost State needs at least two recorded versions. No fake delta is invented.</p>';};
$('editObject').onclick=openEdit;
$('editForm').addEventListener('submit',e=>{
  e.preventDefault();if(!currentObject)return;
  const key=objectArrayKey(currentObject.kind);if(!key)return;
  const title=$('editName').value.trim();if(!title)return;
  const body=$('editBody').value.trim();const at=now();
  currentObject.title=title;currentObject.body=body;if(currentObject.kind==='task')currentObject.detail=body;
  currentObject.pinned=$('editPinned').checked;currentObject.spaceID=$('editSpace').value||null;currentObject.updatedAt=at;
  currentObject.versions=[...(currentObject.versions||[]),{at,title,body}];
  save();record('Object evolved',title);$('editDialog').close();$('objectTitle').textContent=title;renderObjectBody();render();
});
$('objectBody').addEventListener('click',e=>{
  const b=e.target.closest('[data-task-state]');if(!b||!currentObject||currentObject.kind!=='task')return;
  currentObject.state=b.dataset.taskState;currentObject.updatedAt=now();save();record('Task → '+currentObject.state,currentObject.title);renderObjectBody();renderActivity();
});
$('shareObject').onclick=()=>currentObject&&shareText(currentObject.title,currentObject.body||currentObject.detail||currentObject.title);
$('deleteObject').onclick=()=>{
  if(!currentObject)return;
  const key=objectArrayKey(currentObject.kind);if(!key)return;
  const title=currentObject.title;const copy=JSON.parse(JSON.stringify(currentObject));
  state[key]=state[key].filter(x=>x.id!==currentObject.id);
  state.trash.unshift({key,object:copy,trashedAt:now()});state.trash=state.trash.slice(0,30);lastTrashed=state.trash[0];
  save();record('Moved to Trash',title);currentObject=null;$('objectDialog').close();render();
  showToast('Moved “'+title+'” to Trash',()=>{
    if(!lastTrashed)return;
    state[lastTrashed.key].unshift(lastTrashed.object);state.trash=state.trash.filter(x=>x!==lastTrashed);const restored=lastTrashed.object;lastTrashed=null;save();record('Undo Trash',restored.title);render();
  });
};
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&navigator.onLine)syncRuntime();});
window.addEventListener('online',syncRuntime);
window.addEventListener('offline',()=>{state.runtime.live=false;setPresence('gate','Offline · cached state is not live verification');});
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/service-worker.js').catch(()=>{}));
route(state.view||'home');
syncRuntime();