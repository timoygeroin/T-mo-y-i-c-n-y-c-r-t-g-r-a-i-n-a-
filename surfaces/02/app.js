(()=>{'use strict';
const KEY='monday.surface.local.v1';const LEGACY='monday.continuum.local.v1';const VIEW_KEY='monday.surface.view.v1';
const $=(s,root=document)=>root.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto?.randomUUID?.()||'m'+Date.now()+Math.random().toString(36).slice(2);
const now=()=>new Date().toISOString();
const date=s=>new Date(s).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const blank=()=>({schema:KEY,version:1,threads:[],goals:[],notes:[],spaces:[],events:[],prefs:{theme:'dark',quiet:true},activeGoal:null,drafts:{home:'',chat:'',byThread:{}}});
const valid=d=>d&&d.schema===KEY&&d.version===1&&['threads','goals','notes','spaces','events'].every(k=>Array.isArray(d[k]))&&d.prefs&&typeof d.prefs==='object';
let db;try{const parsed=JSON.parse(localStorage.getItem(KEY)||'null');db=valid(parsed)?parsed:blank()}catch{db=blank()}
let view='home',threadId=null,goalId=null,modalAction='',commandQuery='',toastTimer,saveError=false;
let fileRecords=[];
let createdApp=null;
let workEvidence=null,workEvidenceBusy=false,workEvidenceAttempted=false;
let createSpec={kind:'tasks',name:'Моё приложение',description:'Сделано на моём устройстве',theme:'ice'};
// Tab-local navigation resumes the active thought without claiming cross-device sync.
try {
 const cursor=JSON.parse(sessionStorage.getItem(VIEW_KEY)||'null');
 const standard=['home','chats','create','work','spaces','library','system','history','plans'];
 if(cursor?.view==='thread'&&typeof cursor.id==='string'&&db.threads.some(t=>t.id===cursor.id)){view='thread';threadId=cursor.id;}
 else if(cursor?.view==='goal'&&typeof cursor.id==='string'&&db.goals.some(g=>g.id===cursor.id)){view='goal';goalId=cursor.id;}
 else if(standard.includes(cursor?.view))view=cursor.view;
} catch {}
const threadDraft=id=>typeof db.drafts?.byThread?.[id]==='string'?db.drafts.byThread[id]:'';
const ROUTES=['home','chats','create','work','spaces','library','system','history','plans'];
function routeHash(){return '#/'+(view==='thread'?('thread/'+encodeURIComponent(threadId||'')):view==='goal'?('goal/'+encodeURIComponent(goalId||'')):ROUTES.includes(view)?view:'home')}
function readRoute(){
 const hash=String(window.location?.hash||'');if(!hash.startsWith('#/'))return null;
 let parts;try{parts=hash.slice(2).split('/').map(decodeURIComponent)}catch{return null}
 const [next,id]=parts;
 if(next==='thread'&&id&&db.threads.some(t=>t.id===id))return {view:next,id};
 if(next==='goal'&&id&&db.goals.some(g=>g.id===id))return {view:next,id};
 if(ROUTES.includes(next)&&!id)return {view:next,id:null};
 return null;
}
function restoreRoute(){
 const route=readRoute();view=route?.view||'home';threadId=view==='thread'?route.id:null;goalId=view==='goal'?route.id:null;
 // Replace stale/deleted local targets, never add a phantom history entry.
 if(!route)try{window.history?.replaceState?.({monday:true},'',routeHash())}catch{}
 render();window.scrollTo(0,0);
}
const initialRoute=readRoute();
if(initialRoute){view=initialRoute.view;threadId=view==='thread'?initialRoute.id:null;goalId=view==='goal'?initialRoute.id:null}
else if(window.location?.hash){view='home';threadId=null;goalId=null}


const icons={focus:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/>',layers:'<path d="m12 3 8 5-8 5-8-5 8-5zM4 13l8 5 8-5M4 18l8 5 8-5"/>',home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7"/>',chat:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-3-.5L3 21l1.7-5.4A8.5 8.5 0 1 1 21 11.5z"/>',work:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 5V3h8v2M3 12h18"/>',spaces:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',library:'<path d="M4 3h12l4 4v14H4z"/><path d="M16 3v5h4M8 12h8M8 16h7"/>',system:'<circle cx="12" cy="12" r="3"/><path d="M20 12a8 8 0 0 0-.2-1.8l2-1.5-2-3.5-2.4 1A8 8 0 0 0 14 4l-.4-2h-4L9.2 4a8 8 0 0 0-3.4 2.2l-2.4-1-2 3.5 2 1.5A8 8 0 0 0 3.4 14l-2 1.6 2 3.4 2.4-1a8 8 0 0 0 3.4 2.1L9.6 22h4l.4-2a8 8 0 0 0 3.4-2.1l2.4 1 2-3.4-2-1.6A8 8 0 0 0 20 12z"/>',search:'<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',plus:'<path d="M12 5v14M5 12h14"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',left:'<path d="m15 18-6-6 6-6"/>',mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',close:'<path d="M18 6 6 18M6 6l12 12"/>',check:'<path d="m4 12 5 5L20 6"/>',edit:'<path d="m16 4 4 4-12 12H4v-4z"/>',spark:'<path d="m12 2 2 8 8 2-8 2-2 8-2-8-8-2 8-2z"/>',shield:'<path d="M12 22s8-4 8-11V5L12 2 4 5v6c0 7 8 11 8 11z"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5M5 10a8 8 0 0 1 14-3l1 5M19 14a8 8 0 0 1-14 3l-1-5"/>'};
const ic=(name,size=19)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.65" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.spark}</svg>`;
const nav=[['home','Сегодня','home'],['chats','Диалоги','chat'],['create','Создать','spark'],['work','Работа','work'],['spaces','Пространства','spaces'],['library','Библиотека','library'],['system','Система','system']];
const navbtn=([key,label,icon])=>`<button class="nav-item ${view===key?'active':''}" data-nav="${key}" aria-current="${view===key?'page':'false'}">${ic(icon)}<span>${label}</span></button>`;
function notify(text){const n=$('#notice');n.textContent=text;n.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>n.classList.remove('visible'),3500)}
function update(fn,type,detail){const snap=structuredClone(db),candidate=structuredClone(db);try{fn(candidate);if(type)candidate.events.unshift({id:uid(),type,detail:String(detail||''),at:now(),provenance:'LOCAL'});candidate.events=candidate.events.slice(0,300);const serialized=JSON.stringify(candidate);localStorage.setItem(KEY,serialized);db=candidate;saveError=false;render();return true}catch(err){db=snap;saveError=true;notify('Сохранение не удалось. Изменения не применены.');return false}}
function setPref(k,v){update(d=>{d.prefs[k]=v},'settings',`${k}: ${v}`)}
function theme(){const t=db.prefs.theme;document.documentElement.dataset.theme=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'}
function latest(){return [...db.threads.map(t=>({...t,kind:'thread'})),...db.goals.map(g=>({...g,kind:'goal'})),...db.notes.map(n=>({...n,kind:'note'}))].sort((a,b)=>String(b.updatedAt||b.createdAt).localeCompare(String(a.updatedAt||a.createdAt)))}
function currentGoal(){return db.goals.find(g=>g.id===(goalId||db.activeGoal))||null}
function go(next,id){view=next;if(next==='thread')threadId=id;if(next==='goal')goalId=id;try{const wanted=routeHash();if(window.location?.hash!==wanted)window.history?.pushState?.({monday:true},'',wanted)}catch{}render();window.scrollTo(0,0)}
function action(label,id,cls='outline-btn',attrs=''){return `<button class="${cls}" data-do="${id}" ${attrs}>${label}</button>`}
function base(inner,options={}){
 theme();
 const recent=db.threads.slice().sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,4);
 const navHtml=nav.map(navbtn).join('');
 const mobile=[nav[0],nav[1],nav[3],nav[2],['more','Ещё','menu']].map(([k,label,ico])=>`<button data-nav="${k}" class="${view===k?'active':''}" aria-label="${label}" ${view===k?'aria-current="page"':''}>${ic(ico)}<span>${label}</span></button>`).join('');
 const modeLabel=db.prefs.quiet?'Фокус':'Обзор';
 $('#app').innerHTML=`<div class="app">
 <aside class="sidebar" aria-label="Навигация">
   <div class="brand-zone"><button class="wordmark" data-nav="home" aria-label="Monday — главная"><span class="monday-word">monday<span class="brand-period">.</span></span><span class="brand-version">ONE CONTINUUM</span></button>
   <span class="brand-glyph" aria-hidden="true"><svg viewBox="0 0 54 54"><circle cx="27" cy="27" r="14"/><ellipse cx="27" cy="27" rx="25" ry="10" transform="rotate(-45 27 27)"/><circle cx="27" cy="27" r="2.8" fill="currentColor" stroke="none"/></svg></span></div>
   <div class="rail-caption">ПРОСТРАНСТВО</div><div class="railmain">${navHtml}</div>
   <div class="sidebar-recent"><div class="rail-caption">ПРОДОЛЖИТЬ</div><div class="recent-list">${recent.length?recent.map(t=>`<button class="recent-link" data-open-thread="${esc(t.id)}">${esc(t.title)}</button>`).join(''):'<span class="rail-empty">Пока нет диалогов</span>'}</div></div>
   <div class="rail-footer"><div class="rail-status"><span class="status-dot"></span><span>Локальное сохранение</span></div><small>MONDAYID <span class="foot-separator">/</span> SURFACE 02</small></div>
 </aside>
 <section class="main"><header class="topbar"><div class="top-left"><button class="mobile-brand" data-nav="home" aria-label="Monday — главная"><span>monday<span class="brand-period">.</span></span></button><div class="crumb">${esc(options.crumb||'MONDAY / '+(nav.find(n=>n[0]===view)?.[1]||'Диалог'))}</div></div>
 <div class="topactions"><span class="quiet"><i class="top-dot"></i> Только это устройство</span><button class="icon-btn attention-btn" data-do="quiet" aria-label="${modeLabel}: переключить плотность" aria-pressed="${db.prefs.quiet}">${ic(db.prefs.quiet?'focus':'layers')}</button><button class="icon-btn" data-do="search" aria-label="Поиск и команды">${ic('search')}</button><button class="icon-btn top-create" data-do="quick" aria-label="Создать">${ic('plus')}</button></div></header>
 <main class="page ${view==='thread'?'chat-page':''} ${view==='home'?'home-page':''}" id="page">${inner}</main></section></div>
 <nav class="mobilebar" aria-label="Главная навигация"><div class="mobilebar-glass">${mobile}</div></nav>`;
 document.title=`monday. — ${options.title||'Континуум'}`;
 updateNavigationFocus();
}
function updateNavigationFocus(){document.body.classList.toggle('quiet-layout',!!db.prefs.quiet)}
const smallButton=(label,key)=>`<button class="flat-btn" data-nav="${key}">${label}</button>`;
function home(){
 const rec=latest().slice(0,3);
 const activeGoal=db.goals.find(g=>g.id===db.activeGoal);
 const first=activeGoal&&activeGoal.state!=='VERIFIED'?{...activeGoal,kind:'goal'}:rec[0];
 const titleHtml=rec.length?'Продолжим <em>с твоей мысли.</em>':'Не нужно <em>начинать заново.</em>';
 const hero=`<section class="home-stage" aria-label="Monday — сейчас">
   <div class="stage-meta"><span class="stage-serial">01 <span class="serial-line"></span> NOW / MONDAY</span><span class="stage-state"><span class="tiny-ring"></span> Твоя линия здесь</span></div>
   <div class="presence" aria-hidden="true"><div class="presence-halo"></div><div class="presence-path presence-path-a"></div><div class="presence-path presence-path-b"></div><div class="presence-core"><span></span></div><div class="presence-pin"></div></div>
   <div class="home-copy"><div class="eyebrow">ОДНА МЫСЛЬ. ЛЮБАЯ ФОРМА.</div><h1 class="hero-heading">${titleHtml}</h1><p class="lead">Скажи, что важно. Я сохраню это здесь, чтобы вернуться к ней с той же точки.</p></div>
 </section>
 <div class="compose-label"><span>НОВАЯ МЫСЛЬ</span><span class="compose-shortcut">НАЖМИ ENTER, ЧТОБЫ СОХРАНИТЬ</span></div>
 <form class="write-box home-compose" data-form="new-thread"><textarea id="homeDraft" name="text" aria-label="Новое намерение" maxlength="12000" placeholder="Что должно стать возможным?">${esc(db.drafts.home||'')}</textarea><div class="write-actions"><div class="write-actions-left"><button class="icon-btn" type="button" data-do="voice-home" aria-label="Диктовка">${ic('mic')}</button><span class="composer-footnote">Голос или текст · остаётся здесь</span></div><button class="send-btn" type="submit"><span>Сохранить мысль</span>${ic('arrow')}</button></div></form>
 <div class="privacy-inline"><span class="privacy-mark">i</span><span>Локальная версия. Ответы AI и синхронизация пока не подключены.</span><button type="button" class="privacy-help" data-do="why-no-ai">Подробнее</button></div>`;
 const aiLink=`<div class="workbench-link"><div><b>Monday AI · рабочая версия</b><p>Защищённый AI-клиент в отдельном приложении AppDeploy. Локальные данные этой Surface автоматически не передаются.</p></div>${action('Открыть AI '+ic('arrow',15),'open-ai','outline-btn')}</div>`;
 const cont=first?`<section class="now-continuation"><div class="continue-label"><span class="status-beam"></span> ТОЧКА ВОЗВРАТА</div><div class="continue-body"><div><p class="continue-category">${first.kind==='goal'?'АКТИВНАЯ ЦЕЛЬ':first.kind==='thread'?'НЕДАВНИЙ ДИАЛОГ':'ЗАМЕТКА'} · ${date(first.updatedAt||first.createdAt)}</p><h3>${esc(first.title)}</h3><p class="continue-excerpt">${esc(first.kind==='goal'?first.criteria||'Продолжить работу над целью':first.kind==='thread'?'Последняя мысль сохранена на этом устройстве':'Открыть сохранённую заметку')}</p></div>${action('Продолжить '+ic('arrow',16),`open:${first.kind}:${first.id}`,'continue-cta')}</div></section>`:'';
 const recent=`<section class="section recent-section"><div class="section-head"><div><div class="eyebrow">WORLDLINE</div><h2>Недавнее</h2></div>${smallButton('Открыть историю '+ic('arrow',14),'chats')}</div>${rec.length?rec.map((o,i)=>`<div class="row-card recent-row"><span class="recent-index">${String(i+1).padStart(2,'0')}</span><div class="grow"><button class="row-button" data-do="open:${o.kind}:${o.id}"><h3>${esc(o.title)}</h3><p>${o.kind==='thread'?'Диалог':o.kind==='goal'?'Цель':'Заметка'} · ${date(o.updatedAt||o.createdAt)}</p></button></div><span class="row-arrow">${ic('arrow',17)}</span></div>`).join(''):'<div class="empty attention-empty"><span class="empty-figure">—</span> Пока нет сохранённых мыслей. Первая появится здесь, а не в бесконечной истории чатов.</div>'}</section>`;
 base(hero+aiLink+cont+recent+'<footer class="meta-footer">Продолжение важнее начала. Ты можешь экспортировать всю локальную историю.</footer>',{title:'Сейчас',crumb:'СЕЙЧАС / MONDAY'});
}
function chats(){let sorted=db.threads.slice().sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));base(`<div class="header-row"><div><div class="eyebrow">РАЗГОВОРЫ</div><h1>Диалоги</h1></div>${action(ic('plus')+' Новый', 'newthread')}</div><input class="search-field" id="threadSearch" placeholder="Найти диалог" aria-label="Поиск диалогов"><div id="threadList">${sorted.length?sorted.map(t=>`<div class="row-card" data-thread-title="${esc(t.title.toLowerCase())}"><div class="grow"><button class="row-button" data-open-thread="${esc(t.id)}"><h3>${esc(t.title)}</h3><p>${t.messages.length} сообщений · ${date(t.updatedAt)}</p></button></div><button class="icon-btn" data-do="rename-thread:${t.id}" aria-label="Переименовать">${ic('edit',17)}</button></div>`).join(''):'<div class="empty">Каждый диалог может продолжаться — даже если ты отвлёкся.</div>'}</div>`,{title:'Диалоги'})}
function thread(){const t=db.threads.find(x=>x.id===threadId);if(!t)return go('chats');const legacyDraft=typeof db.drafts?.chat==='string'&&db.drafts.chat.trim()?'<button class="flat-btn" type="button" data-do="recover-legacy-draft">Восстановить неприкреплённый черновик</button>':'';const msgs=t.messages.map(m=>`<div class="msg ${m.role==='user'?'user':'system'}">${esc(m.text)}</div>`).join('');base(`<div class="header-row"><div><button class="flat-btn" data-nav="chats">${ic('left',16)} К диалогам</button><h2 style="margin-top:8px">${esc(t.title)}</h2><p class="subtle-note">Сохранено здесь · ${t.messages.length} сообщений</p></div><button class="icon-btn" data-do="thread-menu" aria-label="Действия диалога">${ic('more')}</button></div><div class="message-history">${msgs}${!msgs?'<div class="empty">Начни со своей мысли.</div>':''}<div class="status-text">AI-ответы пока не подключены. Ничего не будет сгенерировано без подтверждённого подключения.</div></div><div class="chat-compose"><form class="write-box" data-form="message"><textarea id="chatDraft" name="text" maxlength="12000" aria-label="Продолжение диалога" placeholder="Продолжи мысль…">${esc(threadDraft(t.id))}</textarea><div class="write-actions"><div class="write-actions-left"><button class="icon-btn" data-do="voice-chat" type="button" aria-label="Диктовать">${ic('mic')}</button>${legacyDraft}<button class="flat-btn" type="button" data-do="why-no-ai">Почему нет AI?</button></div><button class="send-btn" type="submit">Сохранить ${ic('arrow')}</button></div></form></div>`,{title:t.title,crumb:'Диалоги / '+t.title})}

function workProofHtml(record){
 const items=Array.isArray(record?.items)?record.items:[];
 const mode=record?.source==='github'?'GitHub · проверено по запросу':'Проверенный снимок · 22 октября 2026';
 const checked=record?.checkedAt?new Date(record.checkedAt).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
 return '<div class="work-proof-meta"><span class="work-proof-source">'+ic('shield',14)+' '+mode+'</span>'+
   (checked?'<time>'+esc(checked)+'</time>':'<span>Не является показателем работы в фоне</span>')+'</div>'+
   (items.length?'<div class="work-proof-list">'+items.map((item,index)=>{
     const n=Number(item.number);
     if(!Number.isSafeInteger(n)||n<1)return '';
     const url='https://github.com/timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-/pull/'+n;
     return '<a class="work-proof-row" href="'+url+'" target="_blank" rel="noopener noreferrer">'+
       '<span class="work-proof-number">'+String(n).padStart(3,'0')+'</span>'+
       '<span class="work-proof-description"><strong>'+esc(item.title)+'</strong><small>'+esc(item.tag||'Слито в GitHub')+'</small></span>'+
       '<span class="work-proof-arrow" aria-hidden="true">'+ic('arrow',17)+'</span></a>';
   }).join('')+'</div>':'<p class="subtle-note">Пока нет подтверждённых записей.</p>');
}
async function refreshWorkProof({silent=false}={}){
 if(workEvidenceBusy)return;
 if(!window.MondayWorkEvidence||typeof window.fetch!=='function'){
   if(!silent)notify('Нет подключения к источнику. Показан последний проверенный снимок.');
   return;
 }
 workEvidenceAttempted=true;workEvidenceBusy=true;
 try{
   const result=await window.MondayWorkEvidence.retrieve(window.fetch.bind(window));
   workEvidence=result;
   if(view==='work'){
     const element=$('#workEvidenceBody');
     if(element)element.innerHTML=workProofHtml(result);
   }
   if(!silent)notify('Проверены свежие записи публичного GitHub. Это не фоновый агент.');
 }catch(err){
   if(!silent)notify('GitHub недоступен. Проверенный снимок остался на экране.');
 }finally{workEvidenceBusy=false}
}
function work(){
 const gs=db.goals.slice().sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
 const evidence=workEvidence||window.MondayWorkEvidence?.snapshot()||{source:'snapshot',items:[]};
 const remaining=gs.filter(g=>g.state!=='VERIFIED').length;
 const goals=gs.length?gs.map(g=>'<div class="row-card"><div class="grow"><button class="row-button" data-do="goal:'+g.id+'"><h3>'+esc(g.title)+'</h3><p>'+(g.state==='VERIFIED'?'Подтверждено':g.state==='ACTIVE'?'В работе':'Черновик')+' · '+g.steps.filter(x=>x.done).length+' / '+g.steps.length+' действий</p></button></div><span class="line-label">'+ic('arrow')+'</span></div>').join(''):'<div class="empty">Добавь свою цель. Её действия и доказательства сохраняются локально на этом устройстве.</div>';
 base('<div class="work-stage"><div class="work-stage-top"><span class="work-stage-kicker"><span class="work-stage-pulse" aria-hidden="true"></span> MONDAY / WORK</span><span class="work-stage-tag">Наблюдаемое, не выдуманное</span></div>'+
  '<div class="work-stage-copy"><div class="eyebrow">ПАМЯТЬ ДЕЙСТВИЙ</div><h1>Работу должно <em>быть видно.</em></h1><p>Не проценты и не обещания. Код, тесты, публикации и реальные точки продолжения — с источниками, которые можно открыть.</p></div>'+
  '<div class="work-stage-actions"><button class="work-cta" data-nav="create">'+ic('spark',17)+' Создать приложение '+ic('arrow',16)+'</button>'+
  '<a class="work-secondary" href="https://github.com/timoygeroin/T-mo-y-i-c-n-y-c-r-t-g-r-a-i-n-a-/pull/179" target="_blank" rel="noopener noreferrer">Посмотреть исходный код '+ic('arrow',14)+'</a></div>'+
  '<div class="work-stage-bottom"><div class="work-metric"><span>ПРОВЕРЕННЫЕ ИЗМЕНЕНИЯ</span><strong>'+evidence.items.length+'</strong><small>записей в ленте</small></div>'+
  '<div class="work-metric"><span>ВАШИ ОТКРЫТЫЕ ЦЕЛИ</span><strong>'+remaining+'</strong><small>на этом устройстве</small></div>'+
  '<div class="work-metric work-boundary"><span>АКТИВНОСТЬ АГЕНТА</span><strong>Не подтверждена</strong><small>Нет имитации фоновой работы</small></div></div></div>'+
  '<section class="work-proof"><div class="work-proof-title"><div><div class="eyebrow">ПРОИСХОЖДЕНИЕ РЕЗУЛЬТАТА</div><h2>Журнал изменений</h2><p>Публичные GitHub PR. В каждой записи есть исходный код и история проверок.</p></div>'+
  action(ic('refresh',15)+' Обновить из GitHub','refresh-work-proof','outline-btn')+'</div>'+
  '<div id="workEvidenceBody" aria-live="polite">'+workProofHtml(evidence)+'</div>'+
  '<p class="work-truth-note">«Обновить» читает публичный GitHub по запросу. Эта лента не запускает новые задачи, не выдаёт открытые PR за опубликованные функции и не показывает работу, которой нет.</p></section>'+
  '<section class="section work-goals"><div class="section-head"><div><div class="eyebrow">ЛОКАЛЬНОЕ ПРОДОЛЖЕНИЕ</div><h2>Твои цели</h2></div>'+action(ic('plus')+' Цель','newgoal')+'</div>'+goals+'</section>',
 {title:'Работа',crumb:'MONDAY / WORK'});
 if(!workEvidenceAttempted)refreshWorkProof({silent:true});
}
function goal(){const g=currentGoal();if(!g)return go('work');const st=g.steps||[];base(`<div class="header-row"><div><button class="flat-btn" data-nav="work">${ic('left',16)} Все цели</button><h2 style="margin-top:8px">${esc(g.title)}</h2><p class="subtle-note">${g.state==='VERIFIED'?'Результат подтверждён':g.state==='ACTIVE'?'В работе':'Черновик'} · ${date(g.updatedAt)}</p></div><button class="icon-btn" data-do="goal-menu" aria-label="Действия цели">${ic('more')}</button></div><div class="eyebrow">КРИТЕРИЙ ГОТОВНОСТИ</div><p style="font-size:17px;line-height:1.6">${esc(g.criteria||'Пока не определён')}</p><button class="flat-btn" data-do="edit-criteria">Изменить критерий</button><div class="rule"></div><div class="section-head"><h2>Действия</h2><span class="line-label">${st.filter(s=>s.done).length} из ${st.length}</span></div><div class="dense-list">${st.length?st.map(s=>`<label class="checkrow ${s.done?'done':''}"><input type="checkbox" data-step="${s.id}" ${s.done?'checked':''}><span class="grow">${esc(s.text)}</span><button class="icon-btn" type="button" data-do="remove-step:${s.id}" aria-label="Удалить действие">${ic('close',16)}</button></label>`).join(''):'<div class="empty">Добавь первый конкретный шаг.</div>'}</div><form data-form="step" class="field" style="margin-top:22px"><label for="stepInput">Следующее действие</label><div style="display:flex;gap:8px"><input id="stepInput" name="text" maxlength="300" placeholder="Что сделать?"><button class="send-btn" type="submit" aria-label="Добавить действие">${ic('plus')}</button></div></form><div class="section"><div class="section-head"><h2>Доказательство</h2></div>${g.proof?`<div class="notice-box">${esc(g.proof)}<div class="subtle-note" style="margin-top:7px">Записано пользователем · без внешней верификации</div></div>`:'<p class="subtle-note">Результат можно отметить подтверждённым только после явного доказательства.</p>'}<div class="two-actions">${action('Записать доказательство','proof','outline-btn')}${action('Удалить цель','delete-goal','outline-btn danger')}</div></div>`,{title:g.title,crumb:'Работа / '+g.title})}
function spaces(){base(`<div class="header-row"><div><div class="eyebrow">ПРОСТРАНСТВА</div><h1>Мир</h1></div>${action(ic('plus')+' Создать','newspace')}</div><p class="lead">Разные проекты и роли, одна непрерывная история. Пространства — локальные категории, а не отдельные личности.</p><div class="section">${db.spaces.length?db.spaces.map(s=>`<div class="row-card"><div class="grow"><h3>${esc(s.title)}</h3><p>${esc(s.description||'Локальное пространство')}</p></div>${action('Редактировать',`edit-space:${s.id}`,'flat-btn')}</div>`).join(''):'<div class="empty">Создай пространство для проекта или области жизни, когда оно действительно понадобится.</div>'}</div>`,{title:'Пространства'})}

/* Files are stored as browser-local Blobs in IndexedDB, outside the JSON continuity backup. */
const fmtBytes=n=>{const i=Math.min(4,Math.floor(Math.log(Math.max(1,n))/Math.log(1024)));return (n/1024**i).toFixed(i?1:0)+' '+['Б','КБ','МБ','ГБ','ТБ'][i]};
async function refreshFiles(){
  if(!window.MondayFiles?.available())return;
  try{
    const current=await window.MondayFiles.list();
    fileRecords=current;
    if(view==='library')library();
  }catch(err){notify('Файловое хранилище недоступно: '+String(err?.message||err))}
}
async function storeFiles(files){
  if(!files?.length)return;
  if(!window.MondayFiles?.available())return notify('На этом устройстве нет доступа к локальной файловой библиотеке');
  let saved=0;
  for(const file of files){
    try{await window.MondayFiles.add(file);saved++}
    catch(err){notify('Файл '+file.name+' не сохранён: '+String(err?.message||err));break}
  }
  await refreshFiles();
  if(saved)notify('Проверено и сохранено на этом устройстве: '+saved+' файлов');
}
async function saveFileToDevice(id){
  try{
    const saved=await window.MondayFiles.get(id);
    const meta=fileRecords.find(x=>x.id===id);
    if(!saved?.blob||!meta)throw Error('Файл не найден');
    const url=URL.createObjectURL(saved.blob),a=document.createElement('a');
    a.href=url;a.download=meta.name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }catch(err){notify('Не удалось открыть файл: '+String(err?.message||err))}
}
async function removeStoredFile(id){
  const meta=fileRecords.find(x=>x.id===id);
  if(!meta)return;
  if(!window.confirm('Удалить локальный файл «'+meta.name+'»? Отменить нельзя.'))return;
  try{
    await window.MondayFiles.remove(id);
    const checked=await window.MondayFiles.get(id);
    if(checked)throw Error('Удаление не подтвердилось');
    await refreshFiles();notify('Локальный файл удалён');
  }catch(err){notify('Ошибка удаления: '+String(err?.message||err))}
}

function create(){
 const enabled=!!window.MondayAppCompiler?.compile;
 const option=(value,title,selected)=>'<option value="'+value+'" '+(selected===value?'selected':'')+'>'+title+'</option>';
 const form='<form class="create-maker" data-form="build-app">'+
  '<div class="create-fields"><label for="appTitle">Название приложения</label><input id="appTitle" name="name" maxlength="90" required value="'+esc(createSpec.name)+'" placeholder="Например, Мои дела">'+
  '<label for="appKind">Что создаём</label><select id="appKind" name="kind">'+option('tasks','Список задач',createSpec.kind)+option('notes','Заметки',createSpec.kind)+option('landing','Персональный сайт',createSpec.kind)+'</select>'+
  '<label for="appTheme">Внешний вид</label><select id="appTheme" name="theme">'+option('ice','Графит и лёд',createSpec.theme)+option('night','Ночной',createSpec.theme)+option('pearl','Светлый',createSpec.theme)+'</select>'+
  '<label for="appDescription">Описание</label><textarea id="appDescription" name="description" maxlength="700" rows="3" placeholder="О чём приложение?">'+esc(createSpec.description)+'</textarea>'+
  '<button class="send-btn" type="submit" '+(!enabled?'disabled':'')+'>Собрать приложение '+ic('arrow',17)+'</button></div></form>';
 const actions=createdApp?'<div class="create-actions">'+
  action(ic('download',16)+' Скачать HTML','download-app','outline-btn')+
  action('Сохранить в библиотеку','save-app','outline-btn')+'</div>':'';
 const result=createdApp?'<p class="create-result-label">Готовый результат · '+esc(createdApp.filename)+' · 0 внешних зависимостей</p>'+
  '<iframe id="generatedPreview" title="Предпросмотр созданного приложения" sandbox="allow-scripts" loading="lazy"></iframe>':
  '<div class="create-empty">Здесь появится живой предпросмотр созданного приложения. Три шаблона работают без AI-кредитов, сервера и подписки.</div>';
 base('<div class="header-row"><div><div class="eyebrow">ЛОКАЛЬНАЯ МАСТЕРСКАЯ</div><h1>Создать</h1></div><span class="tag">0 кредитов</span></div>'+
 '<p class="lead">MondayID сама пишет независимый HTML-файл. Без AppDeploy и внешних библиотек. Это детерминированные мини-приложения, а не генерация сложного продукта по свободному запросу.</p>'+
 '<div class="create-grid"><section class="create-editor">'+form+
 '<p class="subtle-note">Редактируй поля и нажми «Собрать». Исходный HTML можно сохранить в «Файлы» на iPhone. Пока поддерживаются сайт, задачи и заметки.</p></section>'+
 '<section class="create-showcase"><div class="section-head"><h2>Предпросмотр</h2></div>'+result+actions+'</section></div>'+
 '<div class="file-note">Созданные HTML-файлы работают автономно. Хранение задач и заметок в самом файле зависит от возможностей браузера; это не общая облачная память MondayID.</div>',
 {title:'Создать',crumb:'СОЗДАТЬ / ЛОКАЛЬНО'});
 const frame=$('#generatedPreview');
 if(frame&&createdApp)frame.srcdoc=createdApp.html;
}
function compileGeneratedApp(form){
 if(!window.MondayAppCompiler?.compile)return notify('Локальный компилятор недоступен: не удалось загрузить модуль');
 const data=new FormData(form);
 const next={name:String(data.get('name')||''),kind:String(data.get('kind')||''),theme:String(data.get('theme')||''),description:String(data.get('description')||'')};
 try{createdApp=window.MondayAppCompiler.compile(next);createSpec=next;go('create');notify('Приложение собрано на устройстве. Можно скачать исходный HTML.')}
 catch(err){notify('Компилятор отклонил ввод: '+String(err?.message||err))}
}
function downloadGeneratedApp(){
 if(!createdApp)return notify('Сначала собери приложение');
 const url=URL.createObjectURL(new Blob([createdApp.html],{type:'text/html;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=createdApp.filename;
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),15000);
 notify('HTML подготовлен. Используй меню браузера для сохранения в «Файлы»');
}
async function saveGeneratedApp(){
 if(!createdApp)return notify('Сначала собери приложение');
 if(!window.MondayFiles?.available())return notify('Файловое хранилище недоступно. Используй скачивание HTML');
 try{
  const file=new File([createdApp.html],createdApp.filename,{type:'text/html'});
  await window.MondayFiles.add(file);
  await refreshFiles();
  notify('Приложение сохранено в локальную библиотеку с проверкой записи.');
 }catch(err){notify('Не удалось сохранить файл: '+String(err?.message||err))}
}
function library(){
 const filesHtml=fileRecords.length?fileRecords.map(f=>`<div class="file-row"><span class="line-label">${ic('library',22)}</span><div class="grow"><h3>${esc(f.name)}</h3><p>${fmtBytes(f.size)} · ${esc(f.type||'Файл')} · ${date(f.addedAt)}</p></div><div class="file-actions">${action('Скачать','download-file:'+f.id,'outline-btn')}${action('Удалить','remove-file:'+f.id,'flat-btn danger')}</div></div>`).join(''):'<div class="empty">Здесь пока нет файлов. Можно добавить PDF, архив, видео, изображение или любой другой тип.</div>';
 const ai=`<div class="workbench-link"><div><b>Рабочий AI Monday</b><p>Отдельный защищённый AppDeploy-клиент. Вход, чаты и файлы пока не синхронизированы с этой библиотекой.</p></div>${action('Открыть AI '+ic('arrow',15),'open-ai','outline-btn')}</div>`;
 base(`<div class="header-row"><div><div class="eyebrow">ФАЙЛЫ И ИСТОЧНИКИ</div><h1>Библиотека</h1></div>${action(ic('plus')+' Добавить файлы','add-file')}</div><p class="lead">Файлы любого формата хранятся в браузере на этом устройстве. Загрузка не имеет заданного лимита по размеру файла в коде, но ограничена свободным местом и квотой браузера.</p>${ai}<div class="two-actions">${action('Добавить любые файлы','add-file','outline-btn')}${action('Импортировать текст','import-text','outline-btn')}${action('Скачать копию заметок','export','outline-btn')}</div><section class="file-shelf"><div class="file-shelf-head"><h2>Файлы</h2><span class="tag">${fileRecords.length} локально</span></div>${filesHtml}<div class="file-note"><b>Граница хранения:</b> файлы не отправляются в AI, не синхронизируются с облаком и не входят в JSON-экспорт заметок. Очистка данных Safari может удалить их. Для важных файлов сохраняй оригинал в «Файлах» или другом резервном хранилище.</div></section><div class="section"><div class="section-head"><h2>Заметки</h2>${action(ic('plus')+' Заметка','newnote','outline-btn')}</div>${db.notes.length?db.notes.slice().sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).map(n=>`<div class="row-card"><div class="grow"><button class="row-button" data-do="note:${n.id}"><h3>${esc(n.title)}</h3><p>${date(n.updatedAt)} · ${esc(n.body).slice(0,85)}${n.body.length>85?'…':''}</p></button></div><span class="line-label">${ic('arrow')}</span></div>`).join(''):'<div class="empty">Заметок пока нет.</div>'}</div>`,{title:'Библиотека'})
}
function system(){const storage=(()=>{try{localStorage.setItem('__monday_probe','ok');localStorage.removeItem('__monday_probe');return true}catch{return false}})();base(`<div class="header-row"><div><div class="eyebrow">ПРОЗРАЧНОЕ СОСТОЯНИЕ</div><h1>Система</h1></div></div><div class="notice-box"><b>Что работает сейчас</b><div style="margin-top:7px">Диалоги, цели, заметки, события и настройки сохраняются локально. В этой Surface AI-обработка, межустройственная память и платёжная система не подключены. Есть отдельный AI-клиент AppDeploy; его данные не синхронизированы с Surface.</div></div><div class="section"><div class="section-head"><h2>Внешний вид</h2></div><div class="toggle-row"><div class="grow"><b>Тема</b><p>Стиль всех экранов, без рекламных оболочек</p></div><select class="select" id="themeSelect" aria-label="Тема"><option value="system" ${db.prefs.theme==='system'?'selected':''}>Системная</option><option value="light" ${db.prefs.theme==='light'?'selected':''}>Светлая</option><option value="dark" ${db.prefs.theme==='dark'?'selected':''}>Тёмная</option></select></div><div class="toggle-row"><div class="grow"><b>Тихий режим</b><p>Меньше деталей, без навязчивых уведомлений</p></div><button class="switch ${db.prefs.quiet?'on':''}" data-do="quiet" role="switch" aria-checked="${db.prefs.quiet}" aria-label="Тихий режим"></button></div></div><div class="section"><div class="section-head"><h2>Данные</h2></div><div class="toggle-row"><div class="grow"><b>Локальное хранилище</b><p>${storage?'Доступно':'Недоступно'} · на этом устройстве · без облачной синхронизации</p></div><span class="tag">${storage?'Локально':'Ошибка'}</span></div><div class="toggle-row"><div class="grow"><b>Подключение к MondayID</b><p>Защищённый серверный AI-интерфейс требует отдельной авторизации и разрешения вычислений</p></div><span class="tag">Не подключено</span></div><div class="two-actions">${action(ic('download')+' Экспортировать всё','export')}${action('Импортировать копию','import')}${action('История действий','history')}${action('Тарифная модель','plans')}</div><div class="meta-footer">PWA для Safari, Chrome и компьютера. Офлайн-режим становится доступен после первой успешной онлайн-загрузки; без предварительного кэша приложение не откроется без интернета. Нативные приложения iOS/Android не собраны.</div></div>`,{title:'Система'})}
function history(){base(`<div class="header-row"><div><button class="flat-btn" data-nav="system">${ic('left',16)} К системе</button><h2>Линия изменений</h2></div></div><p class="lead">Факты локальных действий, а не имитация внешнего исполнения.</p><div class="timeline">${db.events.length?db.events.map(e=>`<div class="timeline-item">${esc(e.detail)}<small>${date(e.at)} · ${esc(e.provenance||'LOCAL')}</small></div>`).join(''):'<div class="empty">Первые действия появятся здесь после сохранения.</div>'}</div>`,{title:'История',crumb:'Система / События'})}
function plans(){const tiers=[['Free','Интерфейс, локальные данные, история'],['Core','Больше объёмов обработки и подключений'],['Plus','AI-работа с инструментами и файлами'],['Pro','Продолжительные агентные процессы'],['Teams','Роли, общее рабочее пространство'],['Enterprise','Управление, защита, индивидуальная инфраструктура']];base(`<div class="header-row"><div><button class="flat-btn" data-nav="system">${ic('left',16)} К системе</button><h2>Возможности, не украшения</h2></div></div><p class="lead">Ни один тариф Monday пока не продаётся. Это проект будущей продуктовой модели — не предложение оплаты.</p><div class="section">${tiers.map(([name,desc])=>`<div class="row-card"><div class="grow"><h3>${name}</h3><p>${desc}</p></div><span class="line-label">Концепция</span></div>`).join('')}</div>`,{title:'Тарифная модель',crumb:'Система / Тарифы'})}
function render(){if(!$('#app'))return;try{sessionStorage.setItem(VIEW_KEY,JSON.stringify({view,id:view==='thread'?threadId:view==='goal'?goalId:null}))}catch{};({'home':home,'chats':chats,'create':create,'thread':thread,'work':work,'goal':goal,'spaces':spaces,'library':library,'system':system,'history':history,'plans':plans}[view]||home)()}
function openModal(title,body,actionId,label='Сохранить'){$('#modalroot')?.remove();modalAction=actionId;const root=document.createElement('div');root.className='modal-backdrop';root.id='modalroot';root.innerHTML=`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><div class="modal-head"><h2 id="modalTitle">${esc(title)}</h2><button class="icon-btn" data-do="close-modal" aria-label="Закрыть">${ic('close')}</button></div><form id="modalForm" class="modal-body">${body}<div class="actions"><button type="button" class="outline-btn" data-do="close-modal">Отмена</button><button class="send-btn" type="submit">${esc(label)} ${ic('arrow')}</button></div></form></div>`;root.addEventListener('click',e=>{if(e.target===root)closeModal()});document.body.append(root);$('#modalForm input,#modalForm textarea')?.focus()}
function closeModal(){$('#modalroot')?.remove();modalAction=''}
const field=(key,label,placeholder='',value='',type='input')=>`<div class="field"><label for="modal-${key}">${label}</label>${type==='textarea'?`<textarea name="${key}" id="modal-${key}" placeholder="${esc(placeholder)}" maxlength="12000">${esc(value)}</textarea>`:`<input name="${key}" id="modal-${key}" maxlength="300" value="${esc(value)}" placeholder="${esc(placeholder)}">`}</div>`;
function newThread(initial=''){if(initial){const text=initial.trim();if(!text)return;const id=uid(),t={id,title:text.slice(0,70),messages:[{id:uid(),role:'user',text,at:now()}],createdAt:now(),updatedAt:now()};if(update(d=>{d.threads.unshift(t);d.drafts.home=''},'thread-created',`Новый диалог: ${t.title}`)){go('thread',id)}return}openModal('Новый диалог',field('text','Первая мысль','Напиши как есть…','','textarea'),'newthread','Создать')}
function newGoal(){openModal('Новая цель',field('title','Какой эффект должен получиться?','Хочу, чтобы…')+field('criteria','Как узнаем, что результат достигнут?','Проверяемый критерий','','textarea'),'newgoal','Создать цель')}
function newSpace(id){const s=db.spaces.find(x=>x.id===id);openModal(s?'Пространство':'Создать пространство',field('title','Название','Например, MondayID',s?.title||'')+field('description','Описание','',''+(s?.description||''),'textarea'),`space:${id||'new'}`)}
function noteDialog(id){const n=db.notes.find(x=>x.id===id);openModal(n?'Заметка':'Новая заметка',field('title','Название','Короткий заголовок',n?.title||'')+field('body','Содержание','Наблюдение, источник или мысль',n?.body||'','textarea'),`note:${id||'new'}`,n?'Сохранить':'Создать заметку')}
function confirmDelete(kind,id){const names={thread:'диалог',goal:'цель',note:'заметку',space:'пространство'};openModal(`Удалить ${names[kind]}?`,`<p>Это удалит объект с этого устройства. Отмена действия невозможна, если нет резервной копии.</p>`,`delete:${kind}:${id}`,'Удалить')}
function modalSubmit(form){const v=Object.fromEntries(new FormData(form).entries());const a=modalAction;let ok=false;
 if(a==='newthread'){closeModal();newThread(String(v.text||''));return}
 if(a==='newgoal'){const title=String(v.title||'').trim(),criteria=String(v.criteria||'').trim();if(!title)return notify('Нужно название цели');const id=uid();ok=update(d=>{d.goals.unshift({id,title,criteria,steps:[],state:'DRAFT',createdAt:now(),updatedAt:now(),proof:''});d.activeGoal=id},'goal-created',title);if(ok){closeModal();go('goal',id)}return}
 if(a.startsWith('space:')){const id=a.split(':')[1],title=String(v.title||'').trim();if(!title)return notify('Добавь название');ok=update(d=>{const s=d.spaces.find(x=>x.id===id);if(s){s.title=title;s.description=String(v.description||'');s.updatedAt=now()}else d.spaces.unshift({id:uid(),title,description:String(v.description||''),createdAt:now(),updatedAt:now()})},'space-saved',title);if(ok){closeModal();go('spaces')}return}
 if(a.startsWith('note:')){const id=a.split(':')[1],title=String(v.title||'').trim(),body=String(v.body||'');if(!title&&!body.trim())return notify('Заметка пустая');const safeTitle=title||body.slice(0,65);ok=update(d=>{const n=d.notes.find(x=>x.id===id);if(n){n.title=safeTitle;n.body=body;n.updatedAt=now()}else d.notes.unshift({id:uid(),title:safeTitle,body,createdAt:now(),updatedAt:now()})},'note-saved',safeTitle);if(ok){closeModal();go('library')}return}
 if(a.startsWith('delete:')){const [_,kind,id]=a.split(':');const collection={thread:'threads',goal:'goals',note:'notes',space:'spaces'}[kind];ok=update(d=>{d[collection]=d[collection].filter(x=>x.id!==id);if(kind==='goal'&&d.activeGoal===id)d.activeGoal=null;if(kind==='thread'&&d.drafts?.byThread)delete d.drafts.byThread[id]},'deleted',`${kind} удалён`);if(ok){closeModal();go(kind==='thread'?'chats':kind==='goal'?'work':kind==='note'?'library':'spaces')}return}
 if(a==='criteria'){const g=currentGoal();ok=update(d=>{const x=d.goals.find(z=>z.id===g.id);x.criteria=String(v.criteria||'');x.updatedAt=now()},'goal-updated',`Обновлён критерий: ${g.title}`);if(ok)closeModal();return}
 if(a==='proof'){const g=currentGoal(),proof=String(v.proof||'').trim();if(!proof)return notify('Запиши, что подтверждает результат');if(g.steps.length&&!g.steps.every(s=>s.done))return notify('Есть незавершённые действия — нельзя подтвердить результат');ok=update(d=>{const x=d.goals.find(z=>z.id===g.id);x.proof=proof;x.state='VERIFIED';x.updatedAt=now()},'user-proof',`Пользователь отметил результат: ${g.title}`);if(ok)closeModal();return}
 if(a==='rename-thread'){const t=db.threads.find(x=>x.id===threadId),title=String(v.title||'').trim();if(!title)return notify('Название не может быть пустым');ok=update(d=>{const x=d.threads.find(z=>z.id===t.id);x.title=title;x.updatedAt=now()},'thread-renamed',title);if(ok)closeModal();return}
}
function onDo(key){if(key.startsWith('nav:'))return go(key.slice(4));if(key==='more')return openModal('Разделы Monday',`<div class="stack"><button type="button" class="outline-btn" data-nav="work">Работа</button><button type="button" class="outline-btn" data-nav="spaces">Пространства</button><button type="button" class="outline-btn" data-nav="library">Библиотека</button><button type="button" class="outline-btn" data-nav="system">Система и настройки</button></div>`,'noop','Закрыть');if(key==='quick')return openModal('Быстрое действие',`<div class="stack">${[['Собрать приложение','nav:create'],['Новый диалог','newthread'],['Новая цель','newgoal'],['Новая заметка','newnote'],['Добавить файлы','add-file'],['Рабочий AI','open-ai']].map(([t,k])=>`<button type="button" class="outline-btn" data-do="${k}">${t}</button>`).join('')}</div>`,'noop','Закрыть');if(key==='search')return command();if(key==='recover-legacy-draft'){if(!threadId||!db.drafts?.chat)return;const ok=update(d=>{d.drafts.byThread??={};d.drafts.byThread[threadId]=[d.drafts.byThread[threadId],d.drafts.chat].filter(Boolean).join('\n');d.drafts.chat=''},'draft-recovered','Старый черновик закреплён за диалогом');if(ok)notify('Старый черновик восстановлен в этом диалоге');return}if(key==='close-modal')return closeModal();if(key==='newthread')return newThread();if(key==='newgoal')return newGoal();if(key==='newnote')return noteDialog();if(key==='newspace')return newSpace();if(key==='quiet')return setPref('quiet',!db.prefs.quiet);if(key==='export')return download();if(key==='import')return $('#importPicker').click();if(key==='download-app')return downloadGeneratedApp();if(key==='save-app')return saveGeneratedApp();if(key==='import-text')return $('#textPicker').click();if(key==='add-file')return $('#filePicker').click();if(key==='open-ai')return window.open('https://mondayid-cko9kb.v2.appdeploy.ai/','_blank','noopener,noreferrer');if(key.startsWith('download-file:'))return saveFileToDevice(key.slice(14));if(key.startsWith('remove-file:'))return removeStoredFile(key.slice(12));if(key==='refresh-work-proof')return refreshWorkProof();if(key==='history')return go('history');if(key==='plans')return go('plans');if(key.startsWith('goal:'))return go('goal',key.split(':')[1]);if(key.startsWith('open:')){const [_,kind,id]=key.split(':');return kind==='thread'?go('thread',id):kind==='goal'?go('goal',id):noteDialog(id)}if(key.startsWith('note:'))return noteDialog(key.slice(5));if(key.startsWith('edit-space:'))return newSpace(key.slice(11));if(key==='delete-goal')return confirmDelete('goal',currentGoal().id);if(key==='edit-criteria')return openModal('Критерий результата',field('criteria','Как проверяется завершение?','Действие и доказательство',currentGoal()?.criteria||'','textarea'),'criteria');if(key==='proof')return openModal('Проверка результата',field('proof','Что действительно выполнено и как это проверено?','Опиши наблюдаемое подтверждение','','textarea'),'proof','Подтвердить');if(key==='thread-menu')return openModal('Действия с диалогом',`<div class="stack"><button type="button" class="outline-btn" data-do="rename-thread:${threadId}">Переименовать</button><button type="button" class="outline-btn danger" data-do="delete-thread:${threadId}">Удалить диалог</button></div>`,'noop','Закрыть');if(key.startsWith('delete-thread:'))return confirmDelete('thread',key.slice(14));if(key.startsWith('rename-thread:')){const t=db.threads.find(x=>x.id===key.slice(14));if(!t)return;threadId=t.id;return openModal('Переименовать диалог',field('title','Название','',''+t.title),'rename-thread')}if(key.startsWith('remove-step:')){const g=currentGoal(),sid=key.slice(12);if(!g)return;return update(d=>{const x=d.goals.find(z=>z.id===g.id);x.steps=x.steps.filter(s=>s.id!==sid);x.state='ACTIVE';x.proof='';x.updatedAt=now()},'step-removed',`Удалено действие из ${g.title}`)}if(key==='why-no-ai')return openModal('Честный статус AI','<p>Этот интерфейс сохраняет твои мысли и рабочие состояния. Он не подключён к платной модели или защищённому MondayID API. Никаких выдуманных ответов.</p><p>Подключение возможно после серверной авторизации и проверки. Ключи нельзя вводить в общедоступный браузер.</p>','noop','Закрыть');if(key==='noop')return closeModal();if(key.startsWith('voice-'))return dictate(key.slice(6));}
function renderCommandResults(q='') {
 const query=q.trim().toLocaleLowerCase('ru');
 const commands=[['Новый диалог','newthread'],['Новая цель','newgoal'],['Новая заметка','newnote'],['Собрать приложение','nav:create'],['Резервная копия','export'],['Добавить файлы','add-file'],['Открыть AI','open-ai'],['Пространства','nav:spaces'],['Библиотека','nav:library'],['Система','nav:system']];
 const found=commands.filter(([label])=>!query||label.toLocaleLowerCase('ru').includes(query));
 const objects=latest().filter(o=>!query||String(o.title||'').toLocaleLowerCase('ru').includes(query)).slice(0,8);
 const html=found.map(([label,key])=>`<button type="button" data-command-result class="command-result" data-do="${key}">${esc(label)}</button>`).join('')
   +objects.map(o=>`<button type="button" data-command-result class="command-result" data-do="open:${o.kind}:${o.id}">${esc(o.title)} <span class="line-label"> · ${o.kind==='thread'?'Диалог':o.kind==='goal'?'Цель':'Заметка'}</span></button>`).join('')
   +(!found.length&&!objects.length?'<p class="subtle-note">Ничего не найдено. Попробуй другую формулировку.</p>':'');
 const el=$('#commandResults');if(el)el.innerHTML=html;
}
function command(q=''){
 commandQuery=q;
 openModal('Поиск и действия',`<input class="command-input" id="commandQuery" placeholder="Что найти или сделать?" value="${esc(q)}" aria-label="Поиск по сохранённому" autocomplete="off"><div class="command-results" id="commandResults" aria-live="polite"></div>`,'noop','Закрыть');
 renderCommandResults(q);
 $('#commandQuery')?.focus();
}
function dictate(target){const Rec=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Rec)return notify('Диктовка недоступна в этом браузере');try{const rec=new Rec();rec.lang='ru-RU';rec.interimResults=false;rec.maxAlternatives=1;rec.onresult=e=>{const text=e.results[0][0].transcript;const el=$(target==='home'?'#homeDraft':'#chatDraft');if(el){el.value=[el.value,text].filter(Boolean).join(' ');el.dispatchEvent(new Event('input',{bubbles:true}));notify('Текст готов. Отправка — только по твоему нажатию.')}};rec.onerror=()=>notify('Не получилось распознать речь');rec.start();notify('Слушаю…')}catch{notify('Диктовка сейчас недоступна')}}
function download(){const payload=JSON.stringify({schema:'monday.surface.backup.v1',exportedAt:now(),data:db},null,2);const blob=new Blob([payload],{type:'application/json'}),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='monday-continuity-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);notify('Копия подготовлена')}
const safeImportId=(value,fallback='')=>{
 if(typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value))return value;
 const seed=String(value??'')+'|'+String(fallback);let h1=2166136261,h2=16777619;
 for(let i=0;i<seed.length;i++){const c=seed.charCodeAt(i);h1=Math.imul(h1^c,16777619);h2=Math.imul(h2^c,2246822519)}
 return 'import_'+(h1>>>0).toString(16).padStart(8,'0')+(h2>>>0).toString(16).padStart(8,'0');
};
const safeImportText=(value,max=12000)=>String(value??'').slice(0,max);
const safeImportDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))?value:now();
function importBackup(input){
 if(!input||typeof input!=='object')throw Error('Неверный формат');
 let raw;
 if(input.schema==='monday.surface.backup.v1'&&valid(input.data))raw=input.data;
 else if(input.schema===LEGACY&&Array.isArray(input.threads)){
   raw={...blank(),threads:input.threads,goals:input.tasks||[],notes:input.notes||[],spaces:input.spaces||[],events:input.events||[],prefs:input.prefs||{}};
 }else throw Error('Эта версия копии не поддерживается');
 const collections=['threads','goals','notes','spaces'];
 if(collections.some(k=>!Array.isArray(raw[k])||raw[k].length>5000))throw Error('Некорректный размер копии');
 const obj=value=>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Повреждённый объект в копии');return value};
 const result=blank();
 result.threads=raw.threads.map(item=>{
   const t=obj(item);if(!Array.isArray(t.messages)||t.messages.length>3000)throw Error('Некорректный диалог');
   return {id:safeImportId(t.id,JSON.stringify(t)),title:safeImportText(t.title||'Диалог',500),messages:t.messages.map(item=>{
     const m=obj(item);return {id:safeImportId(m.id,JSON.stringify(m)),role:m.role==='system'||m.role==='monday'?'system':'user',text:safeImportText(m.text),at:safeImportDate(m.at||m.createdAt)};
   }),createdAt:safeImportDate(t.createdAt),updatedAt:safeImportDate(t.updatedAt||t.createdAt)};
 });
 result.goals=raw.goals.map(item=>{
   const g=obj(item),steps=g.steps??g.checkpoints??[];
   if(!Array.isArray(steps)||steps.length>2000)throw Error('Некорректные шаги цели');
   const normalizedSteps=steps.map(item=>{const step=obj(item);return {id:safeImportId(step.id,JSON.stringify(step)),text:safeImportText(step.text??step.title,1000),done:step.done===true}});
   const proof=safeImportText(g.proof||'',12000);
   const status=['DRAFT','ACTIVE','VERIFIED'].includes(g.state)?g.state:g.done?'ACTIVE':'DRAFT';
   return {id:safeImportId(g.id,JSON.stringify(g)),title:safeImportText(g.title||'Цель',500),criteria:safeImportText(g.criteria||''),steps:normalizedSteps,state:status==='VERIFIED'&&(!proof||normalizedSteps.some(s=>!s.done))?'ACTIVE':status,proof,createdAt:safeImportDate(g.createdAt),updatedAt:safeImportDate(g.updatedAt||g.createdAt)};
 });
 result.notes=raw.notes.map(item=>{const n=obj(item);return {id:safeImportId(n.id,JSON.stringify(n)),title:safeImportText(n.title||'Заметка',500),body:safeImportText(n.body),createdAt:safeImportDate(n.createdAt),updatedAt:safeImportDate(n.updatedAt||n.createdAt)}});
 result.spaces=raw.spaces.map(item=>{const n=obj(item);return {id:safeImportId(n.id,JSON.stringify(n)),title:safeImportText(n.title||'Пространство',500),description:safeImportText(n.description),createdAt:safeImportDate(n.createdAt),updatedAt:safeImportDate(n.updatedAt||n.createdAt)}});
 if(raw.events!==undefined&&!Array.isArray(raw.events))throw Error('Некорректная история изменений');
 result.events=(raw.events||[]).slice(0,300).map(item=>{
   const e=obj(item);return {id:safeImportId(e.id,JSON.stringify(e)),type:safeImportText(e.type||e.action||e.kind||'imported-event',120),detail:safeImportText(e.detail||e.label||''),at:safeImportDate(e.at),provenance:'IMPORTED',sourceProvenance:safeImportText(e.provenance||'LOCAL',120)};
 });
 const theme=raw.prefs?.theme;
 result.prefs={...result.prefs,theme:['dark','light','system'].includes(theme)?theme:result.prefs.theme,quiet:typeof raw.prefs?.quiet==='boolean'?raw.prefs.quiet:result.prefs.quiet};
 result.activeGoal=typeof raw.activeGoal==='string'&&result.goals.some(g=>g.id===raw.activeGoal)?raw.activeGoal:null;
 // Portable drafts are normalized, bounded, and tied to normalized thread IDs.
 const sourceDrafts=raw.drafts&&typeof raw.drafts==='object'&&!Array.isArray(raw.drafts)?raw.drafts:{};
 result.drafts.home=typeof sourceDrafts.home==='string'?sourceDrafts.home.slice(0,12000):'';
 result.drafts.chat=typeof sourceDrafts.chat==='string'?sourceDrafts.chat.slice(0,12000):'';
 const rawMap=sourceDrafts.byThread&&typeof sourceDrafts.byThread==='object'&&!Array.isArray(sourceDrafts.byThread)?sourceDrafts.byThread:{};
 const importedIds=new Map(raw.threads.map((t,i)=>[String(t.id),result.threads[i].id]));
 result.drafts.byThread=Object.create(null);
 for(const [oldId,text] of Object.entries(rawMap).slice(0,5000)){
   const id=importedIds.get(oldId);
   if(id&&typeof text==='string')result.drafts.byThread[id]=text.slice(0,12000);
 }
 return result;
}
function importFile(file){
 if(!file||file.size>3e6)return notify('Файл JSON слишком большой (максимум 3 МБ)');
 file.text().then(raw=>{
   const incoming=importBackup(JSON.parse(raw));let count=0;
   const ok=update(d=>{
     const cleanBefore=!['threads','goals','notes','spaces'].some(k=>d[k].length);
     for(const collection of ['threads','goals','notes','spaces','events']){
       const identity=item=>collection==='events'?`${item.at}|${item.type}|${item.detail}`:item.id;
       const seen=new Set(d[collection].map(identity));
       for(const item of incoming[collection])if(!seen.has(identity(item))){d[collection].push(item);seen.add(identity(item));count++}
     }
     d.drafts??={home:'',chat:'',byThread:{}};
     d.drafts.byThread??={};
     const knownThreadIds=new Set(d.threads.map(t=>t.id));
     for(const [id,text] of Object.entries(incoming.drafts.byThread||{})){
       if(knownThreadIds.has(id)&&!Object.prototype.hasOwnProperty.call(d.drafts.byThread,id)&&typeof text==='string')d.drafts.byThread[id]=text;
     }
     if(cleanBefore){
       d.prefs=incoming.prefs;d.activeGoal=incoming.activeGoal;
       if(!d.drafts.home)d.drafts.home=incoming.drafts.home;
       if(!d.drafts.chat)d.drafts.chat=incoming.drafts.chat;
     }
   },'import','Импортирована резервная копия');
   if(ok){go('home');notify(count?`Импортировано ${count} записей с историей. Дубликаты пропущены.`:'Новых записей нет; существующие данные не изменены')}
 }).catch(e=>notify('Импорт отклонён: '+String(e.message||e)))
}
function textFile(file){if(!file||file.size>200000)return notify('Текстовый файл должен быть меньше 200 КБ');file.text().then(body=>{const title=file.name.slice(0,150);const ok=update(d=>d.notes.unshift({id:uid(),title,body,createdAt:now(),updatedAt:now()}),'text-import',title);if(ok){go('library');notify('Текст добавлен локально')}}).catch(()=>notify('Файл не прочитан'))}
document.addEventListener('click',e=>{const navEl=e.target.closest('[data-nav]');if(navEl){if(navEl.dataset.nav==='more'){onDo('more');return}go(navEl.dataset.nav);closeModal();return}const open=e.target.closest('[data-open-thread]');if(open){threadId=open.dataset.openThread;go('thread',threadId);return}const act=e.target.closest('[data-do]');if(act){e.preventDefault();if(act.closest('#commandResults'))closeModal();onDo(act.dataset.do)}});
document.addEventListener('submit',e=>{const form=e.target;if(form.id==='modalForm'){e.preventDefault();modalSubmit(form);return}if(!form.dataset.form)return;e.preventDefault();if(form.dataset.form==='build-app')return compileGeneratedApp(form);const type=form.dataset.form,text=String(new FormData(form).get('text')||'').trim();if(!text)return notify('Напиши хотя бы одну мысль');if(type==='new-thread'){newThread(text);return}if(type==='message'){const id=threadId;const ok=update(d=>{const t=d.threads.find(x=>x.id===id);if(!t)throw Error('Диалог не найден');t.messages.push({id:uid(),role:'user',text,at:now()});t.updatedAt=now();if(d.drafts?.byThread)delete d.drafts.byThread[id]},'message-saved','Сохранено сообщение пользователя');if(ok)notify('Мысль сохранена локально');return}if(type==='step'){const g=currentGoal();if(!g)return;update(d=>{const x=d.goals.find(z=>z.id===g.id);x.steps.push({id:uid(),text,done:false});x.state='ACTIVE';x.proof='';x.updatedAt=now()},'step-added',`Добавлено действие для ${g.title}`);return}});
document.addEventListener('change',e=>{if(e.target.id==='themeSelect')setPref('theme',e.target.value);if(e.target.dataset.step){const g=currentGoal(),id=e.target.dataset.step;if(!g)return;update(d=>{const x=d.goals.find(z=>z.id===g.id),s=x.steps.find(s=>s.id===id);if(s)s.done=e.target.checked;x.state='ACTIVE';x.proof='';x.updatedAt=now()},'step-changed',`Статус действия в ${g.title}`)}if(e.target.id==='importPicker'){importFile(e.target.files[0]);e.target.value=''}if(e.target.id==='textPicker'){textFile(e.target.files[0]);e.target.value=''}if(e.target.id==='filePicker'){const picked=Array.from(e.target.files||[]);e.target.value='';storeFiles(picked)}});
document.addEventListener('input',e=>{if(e.target.id==='homeDraft'||e.target.id==='chatDraft'){const key=e.target.id==='homeDraft'?'home':'chat';try{const next=structuredClone(db);next.drafts??={home:'',chat:'',byThread:{}};if(key==='chat'){if(!threadId)throw Error('Не выбран диалог');next.drafts.byThread??={};next.drafts.byThread[threadId]=e.target.value;}else next.drafts.home=e.target.value;localStorage.setItem(KEY,JSON.stringify(next));db=next}catch{saveError=true;notify('Черновик не сохранился — проверь память браузера')}}if(e.target.id==='threadSearch'){const q=e.target.value.toLowerCase();document.querySelectorAll('[data-thread-title]').forEach(el=>{el.style.display=el.dataset.threadTitle.includes(q)?'':'none'})}if(e.target.id==='commandQuery'){commandQuery=e.target.value;renderCommandResults(commandQuery)}});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();command();return}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='n'){e.preventDefault();newThread();return}if(e.key==='Escape'&&$('#modalroot')){closeModal();return}if(e.key==='Enter'&&!e.shiftKey&&(e.target.id==='chatDraft'||e.target.id==='homeDraft')){e.preventDefault();e.target.closest('form')?.requestSubmit()}if(e.key==='Enter'&&e.target.id==='commandQuery'){e.preventDefault();const first=$('#commandResults [data-command-result]');const key=first?.dataset?.do;if(key){closeModal();onDo(key)}else notify('Ничего не найдено')}});
window.addEventListener('popstate',restoreRoute);window.addEventListener('hashchange',restoreRoute);
window.addEventListener('storage',e=>{if(e.key===KEY){try{const x=JSON.parse(e.newValue);if(valid(x)){db=x;render();notify('Обновлено в другой вкладке')}}catch{}}});
if(window.MondayFiles?.available())refreshFiles();
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
render();
try{if(window.location?.hash!==routeHash())window.history?.replaceState?.({monday:true},'',routeHash())}catch{}
})();
